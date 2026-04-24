# PokéBinder — Claude Code Context

## Project Overview

PokéBinder is a web app that lets users catalog their Pokémon card collection by scanning cards with their camera. Claude Vision identifies each card, the Pokémon TCG API retrieves full set data and market pricing, and persistent storage tracks the user's collection across sessions.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React (JSX, hooks) |
| Styling | Tailwind utility classes (CDN, core only) |
| Card Identification | Anthropic Claude Vision API (`claude-sonnet-4-20250514`) |
| Card/Set Data | Pokémon TCG API v2 (https://api.pokemontcg.io/v2) — no API key required for basic use |
| Storage | `window.storage` (artifact persistent key-value store) |
| Camera | Browser `getUserMedia` API |
| Build | Single-file React artifact (no bundler) |

## Architecture

```
src/
├── App.jsx              # Root — router between screens
├── screens/
│   ├── ScanScreen.jsx   # Camera + image capture + Claude Vision call
│   ├── ConfirmScreen.jsx# Show identified card, price, confirm/discard
│   ├── BinderScreen.jsx # Set grid — owned/missing/chase per series
│   └── DashboardScreen.jsx # Stats: total cards, total value, sets
├── hooks/
│   ├── useCollection.js # Read/write collection to window.storage
│   ├── useCamera.js     # getUserMedia wrapper with fallback to file upload
│   └── usePokemonTCG.js # Fetch card + set data from TCG API
├── components/
│   ├── CardTile.jsx     # Single card in binder grid (owned/missing/chase states)
│   ├── SetProgress.jsx  # Progress bar for a set's completion %
│   └── PriceTag.jsx     # Formatted market price display
└── utils/
    ├── chaseCards.js    # Rarity strings considered "chase"
    └── storage.js       # window.storage helpers with try/catch
```

> **Note:** Since this is a single-file React artifact, all components will be defined in one file at build time. The structure above is the logical organization to follow.

## Data Models

### StoredCard
```typescript
{
  id: string;            // Pokémon TCG card ID (e.g. "sv6-001")
  name: string;          // Card name (e.g. "Charizard ex")
  setId: string;         // Set ID (e.g. "sv6")
  setName: string;       // Set name (e.g. "Twilight Masquerade")
  number: string;        // Card number within set (e.g. "001")
  rarity: string;        // Rarity string from TCG API
  imageUrl: string;      // Small image URL from TCG API
  marketPrice: number | null;  // USD from tcgplayer.prices or cardmarket.prices
  scannedAt: string;     // ISO timestamp
  quantity: number;      // Default 1, increment on re-scan
}
```

### Collection (stored at key `"collection"`)
```typescript
{
  cards: Record<string, StoredCard>;  // keyed by card ID
  totalValue: number;                 // sum of all marketPrice * quantity
  lastUpdated: string;                // ISO timestamp
}
```

### SetCache (stored at key `"setcache:{setId}"`)
```typescript
{
  setId: string;
  setName: string;
  totalCards: number;
  cards: Array<{
    id: string;
    name: string;
    number: string;
    rarity: string;
    imageUrl: string;
  }>;
  cachedAt: string;   // ISO timestamp — re-fetch if older than 24h
}
```

## Screen Flows

### ScanScreen
1. Request camera permission via `getUserMedia({ video: { facingMode: 'environment' } })`
2. Render live video feed in `<video>` element
3. On "Capture" button: draw frame to `<canvas>`, export as base64 JPEG
4. Call Claude Vision API with base64 image (see API Integration below)
5. On success: navigate to ConfirmScreen with identified card data
6. On failure or low-confidence: show error with retry option
7. **Fallback**: If camera unavailable, show file `<input type="file" accept="image/*">` instead

### ConfirmScreen
Props received: `{ identifiedCard, rawImageBase64 }`

1. Display the captured image thumbnail
2. Display identified card name, set, number, rarity
3. Fetch full card data from TCG API using identified card ID
4. Display market price (tcgplayer market price preferred, cardmarket as fallback)
5. Display running collection total value (existing total + this card's price)
6. **Duplicate check**: if card ID already in collection, show "You already have this! Add another copy?" with quantity increment option
7. "Add to Collection" → save to storage → navigate to BinderScreen for that set
8. "Discard" → back to ScanScreen

### BinderScreen
Props received: `{ setId }` (or navigated to directly)

1. Fetch full set checklist from TCG API (use SetCache if fresh)
2. For each card in set, show CardTile:
   - **Owned** (green checkmark): user has this card
   - **Missing** (gray, dimmed): user doesn't have it
   - **Chase** (gold star badge): rarity is in CHASE_RARITIES list
3. Show SetProgress bar at top (X / Y cards, Z% complete)
4. Show total value of owned cards in this set
5. Clicking an owned card shows its stored details + price

### DashboardScreen
1. Total unique cards owned
2. Total collection value (USD)
3. List of all sets the user has started, with per-set completion %
4. "Scan a Card" CTA button → ScanScreen
5. "View Binder" per set → BinderScreen

## API Integration

### Claude Vision — Card Identification

**Endpoint:** `POST https://api.anthropic.com/v1/messages`

```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `You are a Pokémon TCG card identification assistant. 
When given an image of a Pokémon card, identify it precisely and return ONLY a JSON object with no preamble or markdown.

Return this exact structure:
{
  "name": "card name as printed",
  "setName": "set name as printed",
  "number": "card number as printed (e.g. 001/167)",
  "rarity": "rarity as printed or inferred from symbol",
  "confidence": "high|medium|low",
  "notes": "any issues or ambiguity"
}

If you cannot identify the card with at least medium confidence, set confidence to "low" and explain in notes.`,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: base64ImageData
          }
        },
        { type: "text", text: "Identify this Pokémon card." }
      ]
    }]
  })
});

const data = await response.json();
const text = data.content.find(b => b.type === "text")?.text || "";
const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
```

**After identification:** Search the TCG API to find the exact card record using the name + set name.

### Pokémon TCG API — Card Search

```javascript
// Search for a card by name and set
const res = await fetch(
  `https://api.pokemontcg.io/v2/cards?q=name:"${cardName}" set.name:"${setName}"&pageSize=10`
);
const data = await res.json();
const card = data.data[0]; // Use first result; show options if multiple

// Get market price
const price = card.tcgplayer?.prices?.holofoil?.market
  ?? card.tcgplayer?.prices?.normal?.market
  ?? card.cardmarket?.prices?.averageSellPrice
  ?? null;
```

### Pokémon TCG API — Full Set Checklist

```javascript
// Fetch all cards in a set (paginate if needed)
const res = await fetch(
  `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&orderBy=number`
);
const data = await res.json();
// data.data is array of all cards in set
```

**Cache this in `window.storage` at key `"setcache:{setId}"` with a 24-hour TTL.**

## Chase Card Rarities

```javascript
// utils/chaseCards.js
export const CHASE_RARITIES = new Set([
  "Rare Holo",
  "Rare Ultra",
  "Rare Secret",
  "Rare Rainbow",
  "Rare Shining",
  "Amazing Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "ACE SPEC Rare",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Rare Holo EX",
  "Rare Holo GX",
  "Trainer Gallery Rare Holo",
  "Double Rare",
  "Ultra Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
]);

export const isChase = (rarity) => CHASE_RARITIES.has(rarity);
```

## Storage Helpers

```javascript
// utils/storage.js
const COLLECTION_KEY = "collection";

export async function loadCollection() {
  try {
    const result = await window.storage.get(COLLECTION_KEY);
    return result ? JSON.parse(result.value) : { cards: {}, totalValue: 0, lastUpdated: null };
  } catch {
    return { cards: {}, totalValue: 0, lastUpdated: null };
  }
}

export async function saveCard(card) {
  const collection = await loadCollection();
  const existing = collection.cards[card.id];
  
  if (existing) {
    existing.quantity += 1;
  } else {
    collection.cards[card.id] = { ...card, quantity: 1 };
  }
  
  collection.totalValue = Object.values(collection.cards)
    .reduce((sum, c) => sum + (c.marketPrice ?? 0) * c.quantity, 0);
  collection.lastUpdated = new Date().toISOString();
  
  await window.storage.set(COLLECTION_KEY, JSON.stringify(collection));
  return collection;
}

export async function loadSetCache(setId) {
  try {
    const result = await window.storage.get(`setcache:${setId}`);
    if (!result) return null;
    const cache = JSON.parse(result.value);
    const age = Date.now() - new Date(cache.cachedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) return null; // Expired
    return cache;
  } catch {
    return null;
  }
}

export async function saveSetCache(setId, data) {
  try {
    await window.storage.set(`setcache:${setId}`, JSON.stringify({
      ...data,
      cachedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.warn("Set cache save failed:", e);
  }
}
```

## Visual Design

### Theme
- **Dark background:** `#0f0f0f` / `#1a1a1a`
- **Accent:** Pokémon red `#E3350D` for CTAs and highlights
- **Gold:** `#FFD700` for chase card indicators
- **Success green:** `#22c55e` for owned cards
- **Muted gray:** `#4a4a4a` for missing cards
- **Font:** `'Exo 2'` from Google Fonts (bold, techy feel appropriate for TCG)

### Card Tile States
```
Owned:   bright card image, green checkmark badge, quantity bubble if >1
Missing: desaturated/blurred card image (or silhouette), gray overlay
Chase:   gold star badge overlaid on corner, subtle glow effect
```

### Key UX Rules
- Always show a loading skeleton while API calls are in flight
- Camera viewfinder should be full-width on mobile
- Binder grid: 3 columns on mobile, 5 on desktop
- Prices always formatted as `$X.XX` with 2 decimal places; show `—` if null
- Never auto-navigate away from ConfirmScreen; always require explicit user action

## Error Handling

| Error | Handling |
|---|---|
| Camera permission denied | Show file upload fallback immediately |
| Claude Vision confidence = "low" | Show warning banner, still allow manual edit of fields |
| TCG API card not found | Show "Card not found" with manual entry option |
| TCG API rate limit (429) | Show "Try again in a moment" toast |
| Storage write failure | Show toast, don't block UI |
| No market price available | Show `—` in price field, still allow adding card |

## Development Notes

- This is a **single-file React artifact** — all components in one `.jsx` file
- No build step, no npm, no bundler — runs directly in the Claude artifact sandbox
- Import React hooks at top: `import { useState, useEffect, useRef, useCallback } from "react"`
- Available libraries: `lucide-react` for icons, `recharts` for any charts on dashboard
- Do **not** use `localStorage` — use `window.storage` API only
- Do **not** use `<form>` elements — use `onClick`/`onChange` handlers
- Tailwind utility classes only — no custom CSS unless inline styles are necessary

## Phase Plan

### Phase 1 (MVP) — Scan, Identify, Price, Save
- ScanScreen (camera + file fallback)
- Claude Vision card identification
- ConfirmScreen with market price + running total
- Save to collection via window.storage
- Duplicate detection

### Phase 2 — Binder View
- BinderScreen with full set checklist
- Owned / missing / chase card states
- Set completion progress bar
- Set cache in window.storage

### Phase 3 — Dashboard
- DashboardScreen with stats
- Per-set completion summary
- Navigation between all screens

### Phase 4 — Polish
- Animations on card add
- Search/filter in binder
- Manual card entry (no scan)
- Export collection as CSV
