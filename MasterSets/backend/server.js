const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

async function identifyCard(imageBase64, bottomStripBase64 = null) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Server is missing ANTHROPIC_API_KEY");
  }

  const cached = _cacheGet(imageBase64);
  if (cached) return cached;

  // 27 s server-side timeout on the Anthropic call so the backend fails cleanly
  // before the client's 30 s timeout fires.
  const anthropicAbort = new AbortController();
  const anthropicAbortTimer = setTimeout(() => anthropicAbort.abort(), 27000);
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: anthropicAbort.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        // Enables prompt caching so the static system prompt is cached server-side,
        // cutting time-to-first-token on subsequent requests by ~1-2 s.
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: [{
          type: "text",
          text: `You are a Pokemon TCG card identification assistant. Analyze the card image carefully and return ONLY a JSON object with no preamble or markdown backticks.

To identify the SET accurately:
- The card number at the bottom (e.g. "025/191") — the TOTAL (191) is highly specific to a set
- The small set symbol icon at the bottom right near the number
- The copyright/trademark text at the very bottom edge
The image has been tightly cropped to the card face. When a second image is provided, it is a zoomed view of the bottom strip of the same card — prioritize it for reading the card number, set symbol, and copyright text.

- Recent English sets by card total: Journey Together (190), Prismatic Evolutions (131), Surging Sparks (191), Stellar Crown (142), Shrouded Fable (99), Twilight Masquerade (167), Temporal Forces (162), Paldean Fates (91), Paradox Rift (182), Obsidian Flames (197), Pokemon 151 (165), Paldea Evolved (193), Scarlet & Violet Base (258).

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
          ...(bottomStripBase64 ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: bottomStripBase64 } }] : []),
          { type: "text", text: bottomStripBase64 ? "Image 1: full card. Image 2: zoomed bottom strip (card number + set symbol). Identify this Pokemon card." : "Identify this Pokemon card." },
        ],
      }],
    }),
  });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Analysis timed out");
    throw e;
  } finally {
    clearTimeout(anthropicAbortTimer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Anthropic error ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const rawText = data.content?.find(block => block.type === "text")?.text || "";
  const clean = rawText.replace(/```json|```/g, "").trim();
  const result = JSON.parse(clean);
  _cacheSet(imageBase64, result);
  return result;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      backend: "pokebinder-scan",
      anthropicConfigured: Boolean(ANTHROPIC_API_KEY),
    });
    return;
  }

  if (req.method === "POST" && req.url === "/identify-card") {
    try {
      const body = await readBody(req);
      if (!body.imageBase64) {
        sendJson(res, 400, { error: "Missing imageBase64" });
        return;
      }

      const result = await identifyCard(body.imageBase64, body.bottomStripBase64 || null);
      sendJson(res, 200, result);
    } catch (error) {
      const status = error.statusCode || 500;
      sendJson(res, status, { error: error.message || "Card identification failed" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Master Set scan backend running on http://localhost:${PORT}`);
});
