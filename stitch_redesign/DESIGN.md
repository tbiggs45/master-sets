# Design System: The Obsidian Curator

## 1. Overview & Creative North Star
**The Creative North Star: "The Digital Vault"**

This design system is engineered to feel like a private high-end gallery. It moves away from the "busy" utility of common apps to embrace an editorial, museum-like atmosphere. We achieve a "premium" feel by prioritizing negative space, intentional asymmetry, and deep tonal layering. 

The goal is to let the collector’s items take center stage. By utilizing high-contrast typography scales and overlapping elements, we create a sense of tactile depth. This is not a flat interface; it is a series of stacked, physical surfaces that feel expensive, deliberate, and distraction-free.

## 2. Colors: Tonal Architecture
The palette is rooted in the "Deep Dark" philosophy. We do not use color to decorate; we use it to direct the eye with surgical precision.

### Surface Hierarchy & The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. 
Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `background` provides all the edge definition needed.

*   **Background (`#131315`):** The base canvas. Pure, deep, and steady.
*   **Surface Tiers (Lowest to Highest):** Use these to create "nested" depth. 
    *   `surface-container-low` (#1B1B1D) for secondary grouping.
    *   `surface-container-high` (#2A2A2C) for active elevated states.
*   **The "Glass & Gradient" Rule:** To move beyond a standard "out-of-the-box" feel, use Glassmorphism for floating navigation bars or modal headers. Utilize `surface-variant` with a 60% opacity and a 20px backdrop-blur.
*   **Signature Accents:**
    *   **Primary Action (PokéBall Red):** Use `primary` (#FFB4AA) and `primary_container` (#FF5545) for high-stakes actions.
    *   **Financials (Electric Yellow):** Use `secondary` (#CDCC3E) for all monetary values. It provides a sharp, electric contrast against the charcoal background.
    *   **Trends (Success Green):** Use `tertiary` (#53E16F) for positive growth metrics.

## 3. Typography: Editorial Authority
We utilize **Inter** to mimic the San Francisco aesthetic while leaning into a more "Editorial" scale. Hierarchy is driven by extreme contrast: massive display headers paired with tiny, high-tracking labels.

*   **Display (LG/MD):** Used for "Hero" stats or collection titles. It should feel authoritative and slightly oversized.
*   **Title (LG/MD):** The workhorse for card headings. Always use `on_surface` to maintain high readability.
*   **Label (MD/SM):** Use for metadata. Apply 0.05em letter spacing and transform to uppercase for a "premium tag" feel.
*   **The Narrative Flow:** Headlines should often be left-aligned with significant bottom margins (32px+) to give the content room to breathe, breaking the traditional "tight" grid of utility apps.

## 4. Elevation & Depth: The Layering Principle
We reject traditional drop shadows. Depth is achieved through **Tonal Layering**.

*   **Stacking:** Place a `surface_container_lowest` (#0E0E10) card on a `surface` background to create a "sunken" vault feel. Place a `surface_bright` (#39393B) element to indicate a "lifted" interactive state.
*   **Ambient Shadows:** If a floating effect is required (e.g., a floating action button), use a shadow with a 40px blur, 0% spread, and 8% opacity. The shadow color must be a tinted version of `primary` or `on_surface`, never pure black.
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke, use the `outline_variant` (#5D3F3B) at **15% opacity**. This creates a "glint" on the edge rather than a hard line.
*   **Glassmorphism:** Treat cards as frosted obsidian. Use semi-transparent surface tokens to allow the "glow" of background accents (like a blurred red circle behind a card) to bleed through, adding "visual soul."

## 5. Components

### Cards & Lists
*   **The Rule:** Forbid the use of divider lines. 
*   **Implementation:** Separate items using `md` (1.5rem) or `lg` (2rem) vertical whitespace. For lists, use a subtle background shift on hover/active states using `surface_container_highest`. 
*   **Radii:** All collection cards must use `lg` (2rem/32px) corner radii for a friendly yet sophisticated "Squircle" look.

### Buttons
*   **Primary:** `primary_container` (#FF5545) background with `on_primary_container` text. Large `full` (9999px) or `md` (1.5rem) radii.
*   **Secondary:** Ghost style. No background, `outline` stroke at 20% opacity. 
*   **Financial CTA:** Use `secondary_fixed` (Electric Yellow) for "Buy" or "Appraise" actions to signify value.

### Inputs & Chips
*   **Input Fields:** Use `surface_container_lowest` for the field body. No border. Focus state is indicated by a subtle glow of the `surface_tint` (#FFB4AA).
*   **Chips:** Selection chips should use the `tertiary_container` for a subtle green "active" glow, reinforcing the positive feeling of curation.

### Specialized Component: The "Value Glow"
For high-value items in a list, apply a subtle outer glow using the `secondary` (Yellow) token at 10% opacity. This creates a "halo" effect around rare items in the collection.

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Let titles hang over the edge of card containers slightly to create a bespoke, custom-coded feel.
*   **Use Tonal Shifts:** Always use background color changes to denote new sections rather than lines.
*   **Prioritize Breathing Room:** If you think there is enough margin, double it. Premium design is defined by the space you *don't* use.

### Don't:
*   **Never use 100% White:** Use `on_surface` (#E4E2E4) for text. Pure white (#FFFFFF) causes "vibration" against pure black backgrounds and hurts readability.
*   **No Hard Borders:** Avoid any 1px solid lines. They make an app look like a bootstrap template.
*   **Avoid Flatness:** Never place a surface-level element directly onto another surface of the same color. Always increment the container tier.