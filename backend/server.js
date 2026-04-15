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

async function identifyCard(imageBase64) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Server is missing ANTHROPIC_API_KEY");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: `You are a Pokemon TCG card identification assistant. Analyze the card image carefully and return ONLY a JSON object with no preamble or markdown backticks.

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
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: "Identify this Pokemon card." },
        ],
      }],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Anthropic error ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const rawText = data.content?.find(block => block.type === "text")?.text || "";
  const clean = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
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

      const result = await identifyCard(body.imageBase64);
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
