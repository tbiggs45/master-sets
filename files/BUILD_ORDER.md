# PokéBinder — Build Order & Implementation Notes

This document is the step-by-step guide for Claude Code to build PokéBinder as a single-file React artifact.

---

## Single-File Architecture

Everything lives in one `.jsx` file. Structure it in this order:

```
1. Imports (React hooks, lucide-react icons)
2. Constants (CHASE_RARITIES, API endpoints, storage keys)
3. Storage utilities (loadCollection, saveCard, loadSetCache, saveSetCache)
4. API utilities (identifyCardWithVision, fetchCardByNameAndSet, fetchSetCards)
5. Helper functions (extractPrice, formatPrice, isChase)
6. Components (CardTile, SetProgress, PriceTag, LoadingSkeleton)
7. Screens (ScanScreen, ConfirmScreen, BinderScreen, DashboardScreen)
8. App (root component with screen routing via useState)
9. Default export
```

---

## Phase 1 Build Steps

### Step 1 — Scaffold App shell

Create the root `App` component with a `screen` state variable:

```javascript
const [screen, setScreen] = useState("dashboard"); // "scan" | "confirm" | "binder" | "dashboard"
const [screenProps, setScreenProps] = useState({});

function navigate(screenName, props = {}) {
  setScreen(screenName);
  setScreenProps(props);
}
```

Render the correct screen based on `screen` value.

---

### Step 2 — ScanScreen

Build in this order:
1. `useRef` for video element, `useState` for stream, loading, error
2. `startCamera()` async function using `getUserMedia`
3. `useEffect` to start camera on mount, stop on unmount
4. Render: video element + capture button
5. `captureFrame()` function → sets `capturedBase64` state
6. `identifyCard(base64)` → calls Claude Vision API → navigates to ConfirmScreen with result
7. Add file upload `<input>` as fallback (show if camera fails)
8. Add loading state during identification ("Analyzing card...")

**Camera error states to handle:**
- `NotAllowedError` → permission denied → show file upload
- `NotFoundError` → no camera → show file upload
- Any other error → show file upload with error message

---

### Step 3 — Claude Vision Integration

```javascript
async function identifyCardWithVision(base64) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `...`, // Full system prompt from API_REFERENCE.md
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: "Identify this Pokémon card." }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.content.find(b => b.type === "text")?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}
```

---

### Step 4 — TCG API Card Lookup

```javascript
async function fetchCardByNameAndSet(name, setName) {
  const q = encodeURIComponent(`name:"${name}" set.name:"${setName}"`);
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=10`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0] ?? null;
}
```

Call this from ConfirmScreen after receiving Vision result to get official card record + price.

---

### Step 5 — ConfirmScreen

Props: `{ visionResult, capturedBase64 }`

State:
- `tcgCard` — fetched TCG API card (null while loading)
- `loading` — bool
- `name`, `setName`, `number` — editable strings, pre-filled from visionResult

On mount: fetch TCG card using Vision result, set state.

Display:
- Thumbnail of captured image (`<img src={\`data:image/jpeg;base64,${capturedBase64}\`} />`)
- Editable name/set/number fields
- Market price (from tcgCard, formatted)
- Existing collection total + "after adding this card" preview total
- Duplicate warning if card already in collection
- "Add to Collection" button → `saveCard()` → `navigate("binder", { setId })`
- "Rescan" → `navigate("scan")`

---

### Step 6 — Collection Storage

```javascript
const COLLECTION_KEY = "collection";

async function loadCollection() {
  try {
    const result = await window.storage.get(COLLECTION_KEY);
    return result ? JSON.parse(result.value) : { cards: {}, totalValue: 0 };
  } catch {
    return { cards: {}, totalValue: 0 };
  }
}

async function saveCard(tcgCard, marketPrice) {
  const collection = await loadCollection();
  const existing = collection.cards[tcgCard.id];
  
  if (existing) {
    existing.quantity += 1;
  } else {
    collection.cards[tcgCard.id] = {
      id: tcgCard.id,
      name: tcgCard.name,
      setId: tcgCard.set.id,
      setName: tcgCard.set.name,
      number: tcgCard.number,
      rarity: tcgCard.rarity,
      imageUrl: tcgCard.images.small,
      marketPrice,
      scannedAt: new Date().toISOString(),
      quantity: 1
    };
  }

  collection.totalValue = Object.values(collection.cards)
    .reduce((sum, c) => sum + (c.marketPrice ?? 0) * c.quantity, 0);
  collection.lastUpdated = new Date().toISOString();

  await window.storage.set(COLLECTION_KEY, JSON.stringify(collection));
  return collection;
}
```

---

## Phase 2 Build Steps

### Step 7 — BinderScreen

Props: `{ setId }`

State: `setCards[]`, `collection`, `loading`

On mount:
1. Load collection from storage
2. Check set cache; if miss, fetch all cards from TCG API and cache
3. For each card in set, determine: owned? chase? quantity?

Render:
- Set name + total card count
- `SetProgress` component
- Grid of `CardTile` components

```javascript
// Determine card status
function getCardStatus(setCard, collection) {
  const owned = collection.cards[setCard.id];
  return {
    isOwned: !!owned,
    quantity: owned?.quantity ?? 0,
    isChase: CHASE_RARITIES.has(setCard.rarity),
    marketPrice: owned?.marketPrice ?? null
  };
}
```

### Step 8 — CardTile Component

Props: `{ card, isOwned, quantity, isChase }`

```javascript
function CardTile({ card, isOwned, quantity, isChase }) {
  return (
    <div style={{ position: "relative" }}>
      <img 
        src={card.imageUrl} 
        alt={card.name}
        style={{ 
          filter: isOwned ? "none" : "grayscale(100%) opacity(40%)",
          width: "100%",
          borderRadius: 8
        }}
      />
      {isOwned && <span>✓</span>}
      {isChase && <span>⭐</span>}
      {quantity > 1 && <span>×{quantity}</span>}
    </div>
  );
}
```

### Step 9 — SetProgress Component

```javascript
function SetProgress({ owned, total, value }) {
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
  return (
    <div>
      <div>{owned} / {total} cards ({pct}%)</div>
      <div style={{ background: "#333", borderRadius: 4, height: 8 }}>
        <div style={{ width: `${pct}%`, background: "#E3350D", height: 8, borderRadius: 4 }} />
      </div>
      <div>Set value: {formatPrice(value)}</div>
    </div>
  );
}
```

---

## Phase 3 Build Steps

### Step 10 — DashboardScreen

On mount: load collection, compute per-set stats.

```javascript
function computeSetStats(collection) {
  const sets = {};
  for (const card of Object.values(collection.cards)) {
    if (!sets[card.setId]) {
      sets[card.setId] = { setId: card.setId, setName: card.setName, owned: 0, value: 0 };
    }
    sets[card.setId].owned += 1;
    sets[card.setId].value += (card.marketPrice ?? 0) * card.quantity;
  }
  return Object.values(sets);
}
```

Note: `total` cards per set requires a TCG API call or set cache — load from cache if available, otherwise show "?" until binder is visited.

---

## Styling Notes

Use inline styles for custom values; Tailwind for layout/spacing/text.

**Color variables** (define at top of file):
```javascript
const COLORS = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  red: "#E3350D",
  gold: "#FFD700",
  green: "#22c55e",
  muted: "#4a4a4a",
  text: "#f5f5f5",
  textMuted: "#9a9a9a"
};
```

**Font:** Include in the artifact's HTML head or use a `@import` in a style tag:
```html
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;900&display=swap" rel="stylesheet">
```

---

## Common Gotchas

1. **Camera on iOS Safari**: `getUserMedia` requires HTTPS. In the artifact sandbox this is fine, but note for future hosting.

2. **TCG API search quirks**: Card names with `ex`, `V`, `VMAX` etc. must match exactly. If Vision returns "Charizard EX" but the API has "Charizard ex", the search fails. Normalize to lowercase for matching.

3. **Video element needs `playsInline`**: On iOS, omitting this causes the video to open fullscreen.
   ```jsx
   <video ref={videoRef} playsInline muted autoPlay />
   ```

4. **Base64 size**: A 1280×720 JPEG at 85% quality is ~200-400KB. The Claude API accepts this fine.

5. **window.storage is async**: All calls return Promises. Always `await` them.

6. **Re-renders on storage load**: Load collection in `useEffect` and set state — don't try to read storage synchronously.

7. **TCG API card numbers**: Stored as strings like `"006"` or `"SV001"`. Don't cast to integer for comparison.

8. **Rarity strings are exact**: The CHASE_RARITIES set must match the TCG API's exact strings. They are case-sensitive.

---

## Testing Checklist (Phase 1)

- [ ] Camera opens on mobile Chrome
- [ ] Camera opens on mobile Safari  
- [ ] File upload fallback works when camera is denied
- [ ] Vision correctly identifies a Charizard card
- [ ] Vision correctly identifies a common card
- [ ] Low-confidence result shows warning
- [ ] Market price displays correctly
- [ ] Price shows `—` when unavailable
- [ ] Adding a card saves to storage
- [ ] Re-scanning same card shows duplicate warning
- [ ] Duplicate card increments quantity
- [ ] Collection total updates after add
- [ ] Navigating away and back preserves collection
