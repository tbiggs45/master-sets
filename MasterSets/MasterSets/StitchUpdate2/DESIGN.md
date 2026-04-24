# Design System Specification: The Digital Vault

## 1. Overview & Creative North Star: "The Digital Curator"
This design system moves away from the utility-first aesthetic of standard database apps and toward the world of high-end archival displays. Our Creative North Star is **"The Digital Curator."** 

We treat every Pokémon card not as a data entry, but as a museum-grade artifact. The interface must feel like a sophisticated lens—a "smart glass" interface floating over a deep, cosmic void. We break the "template" look by utilizing wide horizontal breathing room, intentional asymmetry in card layouts, and dramatic typography scales that prioritize "Market Value" and "Rarity" as editorial headlines rather than simple table cells.

---

## 2. Colors & Surface Logic
The palette is rooted in the "void" of deep space, using high-chroma accents to signify rarity and energy.

### The Palette
*   **The Void (Background):** `#111417` (Surface) transitioning into deep gradients of `#05070A` to `#1A1033`.
*   **Primary (Action/Progress):** `primary` (`#ffb4aa`) to `primary_container` (`#ee0311`). Use these for critical "Collection Progress" metrics.
*   **Secondary (Value/Wealth):** `secondary_fixed` (`#dfed00`). This is the "Electric Yellow" reserved exclusively for currency, market increases, and top-tier rarity markers.
*   **Tertiary (Highlight/Psychic):** `tertiary_container` (`#bf00ff`). Used for special "Holofoil" states or psychic-type interactions.

### The "No-Line" Rule
Standard 1px solid borders for sectioning are strictly prohibited. You must define boundaries through background shifts or tonal transitions. To separate a "Set List" from the "Collection Overview," use `surface_container_low` against the `surface` background. 

### The "Glass & Gradient" Rule
Floating components must utilize Glassmorphism. 
*   **Surface:** `rgba(255, 255, 255, 0.05)` to `rgba(255, 255, 255, 0.1)`.
*   **Effect:** `backdrop-filter: blur(20px)`.
*   **Signature Texture:** Use a linear gradient for main CTAs transitioning from `primary` to `primary_container` at a 135-degree angle to create a "glowing" physical presence.

---

## 3. Typography
We use a tri-font system to create an editorial hierarchy that feels authoritative yet technical.

*   **Display & Headlines (Space Grotesk):** This is our "Technical Brand" voice. Use `display-lg` (3.5rem) for total collection values. The wide apertures of Space Grotesk suggest a futuristic, high-tech vault.
*   **Titles & Body (Inter):** Our workhorse. `title-lg` (1.375rem) provides high-contrast legibility for card names. 
*   **Labels (Manrope):** Use `label-md` (0.75rem) for metadata (e.g., PSA Grade, Mint Condition). Manrope’s geometric nature complements the glass containers.

**Hierarchy Tip:** Always pair a `display-sm` metric (e.g., $12,450) with a `label-sm` descriptor in all-caps with 0.05em tracking to evoke a "high-end readout" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering

### The Layering Principle
Depth is achieved by stacking the `surface-container` tiers. 
1.  **Base:** `surface` (#111417).
2.  **Sectioning:** `surface_container_low` for large content areas.
3.  **Individual Artifacts:** `surface_container_high` for card previews.

### Ambient Shadows
Avoid black shadows. Use tinted, extra-diffused glows. 
*   **Shadow Value:** `0px 20px 40px rgba(0, 0, 0, 0.4)`. 
*   **The "Ghost Border" Fallback:** If a card needs more definition against a dark background, use a 1px "Ghost Border" using `outline_variant` (#514254) at **15% opacity**. This creates a soft, crystalline edge.

---

## 5. Components

### Artifact Cards (The "Museum" Card)
*   **Style:** No borders. Use `surface_container_highest` with a `20px` blur backdrop filter.
*   **Header:** Card name in `title-md` (Inter), Market Price in `headline-sm` (Space Grotesk).
*   **Interaction:** On hover, increase the opacity of the glass surface from `0.05` to `0.12` and add a subtle `tertiary` glow to the Ghost Border.

### Action Buttons
*   **Primary:** Filled with a gradient of `primary` to `primary_container`. No border. `xl` roundedness (0.75rem).
*   **Secondary:** Ghost style. 1px border using `outline` at 30% opacity. Text in `secondary_fixed` (Electric Yellow).

### Collection Progress Bars
*   **Track:** `surface_container_highest`.
*   **Indicator:** A "Power-Up" gradient from `PokéBall Red` (#FF1C1C) to `Neon Green` (#39FF14) to visually communicate the "evolution" of a collection toward 100%.

### Lists & Tables
*   **Rule:** Forbid divider lines.
*   **Spacing:** Use `1.5rem` (24px) of vertical white space between list items. Use a subtle background shift (`surface_container_low`) on alternating rows or hover states to guide the eye.

### Rarity Chips
*   **Style:** `full` roundedness (pill shape). 
*   **Color:** Background `surface_bright` at 10% opacity. Text color matches the rarity tier (e.g., `secondary_fixed` for Secret Rare).

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical layouts (e.g., a large card featured on the left with a vertically stacked list of stats on the right).
*   **Do** prioritize "Breathability." High-end design requires space for the "artifacts" to feel valuable.
*   **Do** use `spaceGrotesk` for all numerical data—it’s our signature for "Master Set" metrics.

### Don't
*   **Don't** use pure white (`#FFFFFF`) for text. Use `on_surface` (#e1e2e7) to reduce eye strain against the dark background.
*   **Don't** use standard drop shadows (e.g., `offset-y: 2px`). They break the "floating glass" illusion. 
*   **Don't** use solid colors for buttons. Always use a subtle gradient or a high-transparency glass effect to maintain the "Vault" atmosphere.