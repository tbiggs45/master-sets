const http = require("http");

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const PORT = toPositiveInt(process.env.PORT, 8787);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MAX_BODY_BYTES = toPositiveInt(process.env.MAX_BODY_BYTES, 8 * 1024 * 1024); // 8MB default
const MAX_IMAGE_BASE64_LENGTH = toPositiveInt(process.env.MAX_IMAGE_BASE64_LENGTH, 11_000_000); // ~8MB jpeg binary
const REQUESTS_PER_WINDOW = toPositiveInt(process.env.RATE_LIMIT_MAX, 60);
const RATE_LIMIT_WINDOW_MS = toPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000);
const ANTHROPIC_TIMEOUT_MS = toPositiveInt(process.env.ANTHROPIC_TIMEOUT_MS, 30_000);
const MODEL_NAME = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const _rateLimitMap = new Map();

function getAllowedOrigin(req) {
  if (ALLOWED_ORIGIN === "*") return "*";
  const requestOrigin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGIN.split(",").map(s => s.trim()).filter(Boolean);
  return allowed.includes(requestOrigin) ? requestOrigin : "";
}

function sendJson(req, res, status, payload) {
  const allowOrigin = getAllowedOrigin(req);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeBase64Image(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const dataUri = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(trimmed);
  const raw = dataUri ? dataUri[2] : trimmed;

  if (raw.length === 0 || raw.length > MAX_IMAGE_BASE64_LENGTH) return null;
  if (raw.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return null;
  return raw;
}

function checkRateLimit(clientId) {
  const now = Date.now();
  const currentWindow = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const bucket = _rateLimitMap.get(clientId);
  if (!bucket || bucket.window !== currentWindow) {
    _rateLimitMap.set(clientId, { window: currentWindow, count: 1, touchedAt: now });
    return true;
  }
  bucket.count += 1;
  bucket.touchedAt = now;
  if (_rateLimitMap.size > 5000) {
    const staleBefore = now - (RATE_LIMIT_WINDOW_MS * 3);
    for (const [id, entry] of _rateLimitMap.entries()) {
      if (entry.touchedAt < staleBefore) _rateLimitMap.delete(id);
    }
  }
  return bucket.count <= REQUESTS_PER_WINDOW;
}

function sanitizeResult(raw) {
  if (!raw || typeof raw !== "object") {
    const error = new Error("Model returned unexpected response shape");
    error.statusCode = 502;
    throw error;
  }
  const cleanString = (value, max = 200) => String(value ?? "").trim().slice(0, max);
  const confidence = cleanString(raw.confidence, 10).toLowerCase();
  const normalizedConfidence = ["high", "medium", "low"].includes(confidence) ? confidence : "low";

  const result = {
    name: cleanString(raw.name, 120),
    setName: cleanString(raw.setName, 120),
    number: cleanString(raw.number, 40),
    rarity: cleanString(raw.rarity, 80),
    confidence: normalizedConfidence,
    notes: cleanString(raw.notes, 500),
  };

  if (!result.name) {
    const error = new Error("Model response missing card name");
    error.statusCode = 502;
    throw error;
  }
  return result;
}

// Cache recent results to avoid redundant API calls for identical images.
// Key: lightweight fingerprint (first+last 64 chars + length). TTL: 1 hour.
const _resultCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 100;

function _fingerprint(b64) {
  const len = b64.length;
  return `${b64.slice(0, 64)}|${b64.slice(-64)}|${len}`;
}

function _cacheGet(b64) {
  const entry = _resultCache.get(_fingerprint(b64));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _resultCache.delete(_fingerprint(b64)); return null; }
  return entry.value;
}

function _cacheSet(b64, value) {
  if (_resultCache.size >= CACHE_MAX) {
    _resultCache.delete(_resultCache.keys().next().value);
  }
  _resultCache.set(_fingerprint(b64), { value, ts: Date.now() });
}

async function identifyCard(imageBase64) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Server is missing ANTHROPIC_API_KEY");
  }

  const cached = _cacheGet(imageBase64);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      // Enables prompt caching so the static system prompt is cached server-side,
      // cutting time-to-first-token on subsequent requests by ~1-2 s.
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      max_tokens: 400,
      system: [{
        type: "text",
        text: `You are a Pokemon TCG card identification assistant. Analyze the card image carefully and return ONLY a JSON object with no preamble or markdown backticks.

To identify the SET accurately:
- The card number at the bottom (e.g. "025/191") — the TOTAL (191) is highly specific to a set
- The small set symbol icon at the bottom right near the number
- The copyright/trademark text at the very bottom edge
- Recent English sets by card total: Surging Sparks (191), Stellar Crown (142), Shrouded Fable (99), Twilight Masquerade (167), Temporal Forces (162), Paldean Fates (91), Paradox Rift (182), Obsidian Flames (197), Pokemon 151 (165), Paldea Evolved (193), Scarlet & Violet Base (258).

Return this exact structure:
{
  "name": "card name as printed",
  "setName": "official set name",
  "number": "card number as printed (e.g. 025/191)",
  "rarity": "rarity as printed or inferred from symbol",
  "confidence": "high|medium|low",
  "notes": "any issues or observations"
}

If blurry or not a Pokemon card, set confidence to low and explain in notes.`,
        cache_control: { type: "ephemeral" },
      }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: "Identify this Pokemon card." },
        ],
      }],
    }),
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Anthropic error ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const rawText = data.content?.find(block => block.type === "text")?.text || "";
  const clean = rawText.replace(/```json|```/g, "").trim();
  let result;
  try {
    result = JSON.parse(clean);
  } catch {
    throw new Error("Model returned invalid JSON");
  }
  const sanitized = sanitizeResult(result);
  _cacheSet(imageBase64, sanitized);
  return sanitized;
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;

  if (req.method === "OPTIONS") {
    const allowOrigin = getAllowedOrigin(req);
    res.writeHead(204, {
      ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(req, res, 200, {
      ok: true,
      backend: "pokebinder-scan",
      anthropicConfigured: Boolean(ANTHROPIC_API_KEY),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/identify-card") {
    try {
      const contentType = (req.headers["content-type"] || "").toLowerCase();
      if (!contentType.startsWith("application/json")) {
        sendJson(req, res, 415, { error: "Content-Type must be application/json" });
        return;
      }
      const clientId = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
        .toString()
        .split(",")[0]
        .trim();
      if (!checkRateLimit(clientId)) {
        res.setHeader("Retry-After", Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
        sendJson(req, res, 429, { error: "Too many requests, please retry shortly" });
        return;
      }

      const body = await readBody(req);
      if (!body.imageBase64) {
        sendJson(req, res, 400, { error: "Missing imageBase64" });
        return;
      }
      const normalizedImage = normalizeBase64Image(body.imageBase64);
      if (!normalizedImage) {
        sendJson(req, res, 400, { error: "Invalid imageBase64 payload" });
        return;
      }

      const result = await identifyCard(normalizedImage);
      sendJson(req, res, 200, result);
    } catch (error) {
      const status = error.statusCode || 500;
      const message = error.name === "AbortError"
        ? "Upstream model timed out"
        : (error.message || "Card identification failed");
      sendJson(req, res, status, { error: message });
    }
    return;
  }

  sendJson(req, res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Master Set scan backend running on http://localhost:${PORT}`);
});
