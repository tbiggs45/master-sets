# PokéBinder — API Reference

## 1. Claude Vision API

**Purpose:** Identify a Pokémon card from a camera-captured image.

**Endpoint:** `POST https://api.anthropic.com/v1/messages`

**Headers:**
```
Content-Type: application/json
```
> Note: API key is injected automatically by the artifact sandbox. Do not hardcode or pass a key.

### Request Body

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1000,
  "system": "You are a Pokémon TCG card identification assistant. When given an image of a Pokémon card, identify it precisely and return ONLY a JSON object with no preamble or markdown backticks.\n\nReturn this exact structure:\n{\n  \"name\": \"card name as printed\",\n  \"setName\": \"set name as printed\",\n  \"number\": \"card number as printed (e.g. 001/167)\",\n  \"rarity\": \"rarity as printed or inferred from rarity symbol\",\n  \"confidence\": \"high|medium|low\",\n  \"notes\": \"any issues, ambiguity, or important observations\"\n}\n\nIf the image is blurry, obstructed, or not a Pokémon card, set confidence to low and explain in notes.",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "<BASE64_STRING>"
          }
        },
        {
          "type": "text",
          "text": "Identify this Pokémon card."
        }
      ]
    }
  ]
}
```

### Response Handling

```javascript
const data = await response.json();
const textBlock = data.content.find(b => b.type === "text");
const rawText = textBlock?.text || "";

// Strip any accidental markdown fences
const clean = rawText.replace(/```json|```/g, "").trim();
const card = JSON.parse(clean);

// card shape:
// {
//   name: string,
//   setName: string,
//   number: string,       // e.g. "001/167"
//   rarity: string,
//   confidence: "high" | "medium" | "low",
//   notes: string
// }
```

### Confidence Handling

| Confidence | Action |
|---|---|
| `high` | Auto-populate ConfirmScreen fields, no warning |
| `medium` | Auto-populate fields, show subtle "Please verify card details" note |
| `low` | Show warning banner: "We couldn't identify this card confidently — please check the details below" |

---

## 2. Pokémon TCG API

**Base URL:** `https://api.pokemontcg.io/v2`  
**Auth:** No API key required for free tier (100 req/day per IP; sufficient for personal use)  
**Docs:** https://docs.pokemontcg.io

---

### 2.1 Search for a Card by Name + Set

Used on ConfirmScreen to get the official card record after Vision identification.

```
GET /v2/cards?q=name:"{name}" set.name:"{setName}"&pageSize=10
```

**Example:**
```
GET https://api.pokemontcg.io/v2/cards?q=name:"Charizard ex" set.name:"Twilight Masquerade"&pageSize=10
```

**Response shape (relevant fields):**
```json
{
  "data": [
    {
      "id": "sv6-006",
      "name": "Charizard ex",
      "number": "006",
      "rarity": "Double Rare",
      "set": {
        "id": "sv6",
        "name": "Twilight Masquerade",
        "total": 167,
        "printedTotal": 167
      },
      "images": {
        "small": "https://images.pokemontcg.io/sv6/6.png",
        "large": "https://images.pokemontcg.io/sv6/6_hires.png"
      },
      "tcgplayer": {
        "prices": {
          "holofoil": { "market": 18.50 },
          "reverseHolofoil": { "market": 5.20 },
          "normal": { "market": null }
        }
      },
      "cardmarket": {
        "prices": {
          "averageSellPrice": 16.80
        }
      }
    }
  ],
  "totalCount": 1
}
```

**Price extraction:**
```javascript
function extractPrice(card) {
  return card.tcgplayer?.prices?.holofoil?.market
    ?? card.tcgplayer?.prices?.normal?.market
    ?? card.tcgplayer?.prices?.reverseHolofoil?.market
    ?? card.cardmarket?.prices?.averageSellPrice
    ?? null;
}
```

**If multiple results returned:** Pick the one whose `number` most closely matches the number Claude Vision identified. If still ambiguous, show a small picker UI.

**If zero results returned:** Try a broader search: `q=name:"{name}"` without set filter, or show manual entry form.

---

### 2.2 Fetch All Cards in a Set (Binder Checklist)

Used by BinderScreen to get the full set list.

```
GET /v2/cards?q=set.id:{setId}&pageSize=250&orderBy=number
```

**Note:** Most sets have fewer than 250 cards. If `totalCount > 250`, paginate using `&page=2`, `&page=3`, etc.

**Response:** Same shape as above. Use `data` array — each element is a card with id, name, number, rarity, and images.

**Caching:** Store the result in `window.storage` at key `"setcache:{setId}"` with a 24-hour TTL. Always check cache before fetching.

```javascript
async function fetchSetWithCache(setId) {
  // Check cache first
  const cached = await loadSetCache(setId);
  if (cached) return cached;

  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&orderBy=number`
  );
  const data = await res.json();

  const payload = {
    setId,
    cards: data.data.map(c => ({
      id: c.id,
      name: c.name,
      number: c.number,
      rarity: c.rarity,
      imageUrl: c.images.small
    }))
  };

  await saveSetCache(setId, payload);
  return payload;
}
```

---

### 2.3 API Error Handling

| HTTP Status | Cause | Handling |
|---|---|---|
| 200 | Success | Normal flow |
| 400 | Bad query syntax | Log error, show "Card not found" |
| 404 | No results | Show "Card not found" + manual entry option |
| 429 | Rate limited | Show toast: "Too many requests — try again in a moment" |
| 5xx | Server error | Show generic error + retry button |

```javascript
async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.message === "RATE_LIMITED") {
      // Show rate limit toast
    } else {
      // Show generic error
    }
    return null;
  }
}
```

---

## 3. Browser Camera API

### Opening the Camera

```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: "environment" },  // Rear camera preferred
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
});

videoRef.current.srcObject = stream;
await videoRef.current.play();
```

### Capturing a Frame

```javascript
function captureFrame(videoEl) {
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0);
  
  // Returns base64 string without the data URI prefix
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}
```

### Stopping the Camera

Always stop the stream when leaving ScanScreen to release the camera:

```javascript
function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}
```

Use `useEffect` cleanup:
```javascript
useEffect(() => {
  let stream;
  startCamera().then(s => { stream = s; });
  return () => stopCamera(stream);
}, []);
```

### File Upload Fallback

```javascript
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result.split(",")[1];
    identifyCard(base64);
  };
  reader.readAsDataURL(file);
}

// JSX:
<input 
  type="file" 
  accept="image/*" 
  capture="environment"
  onChange={handleFileUpload}
/>
```

> The `capture="environment"` attribute on mobile browsers opens the camera directly.

---

## 4. window.storage API

All collection data is persisted using the artifact's built-in key-value store.

```javascript
// Get a value
const result = await window.storage.get("collection");
const value = result ? JSON.parse(result.value) : null;

// Set a value
await window.storage.set("collection", JSON.stringify(data));

// Delete a value
await window.storage.delete("collection");

// List all keys
const { keys } = await window.storage.list();

// List keys with prefix
const { keys } = await window.storage.list("setcache:");
```

**Always wrap in try/catch — storage operations can fail.**

### Key Naming Convention

| Key | Content |
|---|---|
| `"collection"` | Full collection JSON (StoredCard map + totals) |
| `"setcache:{setId}"` | Cached set checklist (e.g. `"setcache:sv6"`) |
