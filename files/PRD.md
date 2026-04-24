# PokéBinder — Product Requirements Document

**Version:** 1.0  
**Status:** Ready for Development  
**Last Updated:** 2026-04-04

---

## 1. Product Summary

PokéBinder is a mobile-first web app that digitizes a Pokémon TCG collector's experience. A user points their phone camera at a card; the app identifies it, fetches its current market value, and adds it to a persistent digital binder organized by set. The binder shows exactly which cards the user owns, which are missing, and which are high-value "chase" targets.

---

## 2. Problem Statement

Pokémon card collectors currently have no fast, frictionless way to:
- Know what they own without physically sorting cards
- Track the real-time market value of their collection
- Visualize set completion and identify gaps
- Know which expensive chase cards are in a set before buying packs

Existing apps require manual entry or barcode scanning. PokéBinder uses AI vision to make cataloging as fast as picking up a card.

---

## 3. Target Users

**Primary:** Casual-to-serious Pokémon TCG collectors who buy and open packs.  
**Secondary:** Traders who want a fast way to value and catalog pickups.

---

## 4. Core User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As a collector, I want to scan a card with my camera so it's identified automatically | P0 |
| US-02 | As a collector, I want to see the market price of a scanned card before adding it | P0 |
| US-03 | As a collector, I want to see my running collection total value | P0 |
| US-04 | As a collector, I want to be warned if I scan a card I already own | P0 |
| US-05 | As a collector, I want to see a binder view of a set showing owned vs. missing cards | P1 |
| US-06 | As a collector, I want to know which cards in a set are "chase" cards | P1 |
| US-07 | As a collector, I want to see my overall collection stats on a dashboard | P2 |
| US-08 | As a collector without a camera, I want to upload a photo instead | P1 |

---

## 5. Feature Specification

### 5.1 Card Scanning (Phase 1)

**Camera View**
- Full-width live camera feed using rear-facing camera by default
- Single large "Capture" button at bottom
- Camera permission request with clear explanation
- If permission denied: immediately show file upload fallback
- Accepted file types for fallback: `image/*`

**Card Identification**
- Captured frame sent to Claude Vision API as base64 JPEG
- Claude returns: card name, set name, card number, rarity, confidence level
- Low confidence → show warning but don't block user; allow field edits
- API failure → show error with retry button

**Confirm Screen**
- Shows captured image thumbnail (small, top of screen)
- Editable fields: card name, set name, card number (pre-filled from Vision)
- Market price prominently displayed (fetched from TCG API)
- Running collection total: "Your collection will be worth $X.XX"
- Duplicate warning banner if card already exists in collection
  - Option to add another copy (increments quantity) or discard
- "Add to Collection" primary CTA
- "Discard / Rescan" secondary option

### 5.2 Collection Storage (Phase 1)

- Persist using `window.storage` (survives page refresh)
- Each card stored with: id, name, set, number, rarity, image URL, price, scan timestamp, quantity
- Collection total value auto-recalculated on every add
- Set cache stored separately with 24-hour TTL

### 5.3 Binder View (Phase 2)

**Set Grid**
- Triggered automatically after adding a card (navigates to that card's set)
- Also accessible from Dashboard for any set the user has started
- Card tiles in a grid (3-col mobile, 5-col desktop)
- Each tile shows the official card image from TCG API

**Tile States**
| State | Visual |
|-------|--------|
| Owned | Full color image, green checkmark badge |
| Missing | Desaturated image with gray overlay |
| Chase (owned) | Full color + gold star badge |
| Chase (missing) | Desaturated + gold star badge |

**Set Header**
- Set name and logo
- Progress bar: "X / Y cards (Z%)"
- Total value of owned cards in this set

**Interactions**
- Tap owned card → show stored card details + price
- Tap missing card → "Scan this card" shortcut to ScanScreen

### 5.4 Dashboard (Phase 3)

- Total unique cards in collection
- Total cards including duplicates
- Total collection value in USD
- List of sets started, each showing:
  - Set name
  - Completion percentage + mini progress bar
  - Value of owned cards in set
  - Link to full set binder
- "Scan a Card" floating action button

### 5.5 Chase Card Detection

The following TCG API rarity strings are flagged as chase cards:

- Rare Holo
- Rare Ultra
- Rare Secret
- Rare Rainbow
- Rare Shining
- Amazing Rare
- Illustration Rare
- Special Illustration Rare
- Hyper Rare
- ACE SPEC Rare
- Rare Holo VMAX
- Rare Holo VSTAR
- Rare Holo EX
- Rare Holo GX
- Trainer Gallery Rare Holo
- Double Rare
- Ultra Rare
- Shiny Rare
- Shiny Ultra Rare

---

## 6. Market Price Logic

Source priority (use first available):
1. `card.tcgplayer.prices.holofoil.market`
2. `card.tcgplayer.prices.normal.market`
3. `card.tcgplayer.prices.reverseHolofoil.market`
4. `card.cardmarket.prices.averageSellPrice`
5. `null` → display as `—`

Display format: `$X.XX` (always two decimal places)

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Camera capture to Confirm screen in < 5 seconds on good connection |
| Offline | Collection readable offline (storage); scanning requires connection |
| Mobile-first | Fully usable on 375px wide screen (iPhone SE) |
| Privacy | No card images stored server-side; all data stays in browser storage |
| Accessibility | All interactive elements keyboard accessible; sufficient color contrast |

---

## 8. Out of Scope (v1)

- User accounts / cloud sync
- Multi-device collection sharing
- Barcode/QR scanning (camera OCR only)
- Graded card support (PSA, BGS)
- Selling / marketplace integration
- Non-Pokémon TCGs

---

## 9. Success Metrics

| Metric | Target |
|---|---|
| Card identification accuracy | ≥ 90% high/medium confidence on clean card photos |
| Time to add a card | < 10 seconds from camera open to saved |
| Price availability | Price shown for ≥ 85% of cards |

---

## 10. Phase Delivery Plan

| Phase | Features | Status |
|---|---|---|
| 1 | Scan, Identify, Price, Save, Duplicate detection | **Build first** |
| 2 | Binder view, Set checklist, Chase indicators | After Phase 1 |
| 3 | Dashboard, Stats | After Phase 2 |
| 4 | Polish, Export, Manual entry | After Phase 3 |
