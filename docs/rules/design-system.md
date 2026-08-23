# Design system

Light theme, clean and minimal. Tokens live in `frontend/tailwind.config.ts`;
this file is the human-readable spec (mirrored by the `design-system` skill).

## Color
- **Anchor:** `#06152b` (deep navy, `navy-900`) — text, headings, dark chrome.
- **Canvas:** `#f5f3ed` (warm paper cream). **Surface:** `#ffffff`.
- **Accent:** `#3D6FBE` (brand blue) — links, focus ring, active state;
  `accent-soft` `#e9eff7` for tints, `accent-dark` `#335ea3` for hover.
- **Brand tonal** (`bg-brand`): a single-hue blue gradient — brand mark,
  primary buttons, hero accent, gradient wordmark. NOT a multi-hue gradient.
  Everything else stays flat.
- A very subtle fixed blue wash sits behind the cream canvas (see
  `globals.css`) for depth. Keep it faint.
- **Relevance band** (SourcePanel trust affordance): green `#15803d` (strong),
  amber `#b45309` (medium), red `#b91c1c` (weak).

## Type
- **Inter**, weights 400/500/600/700. System-ui fallback stack.
- Sizes on a tight scale: body 14–15px, headings step up modestly.

## Layout & spacing
- **8px spacing grid** (Tailwind default scale).
- One subtle elevation (`shadow-card`); avoid stacking shadows.
- Rounded corners `rounded-lg` (10px) on cards/inputs.

## Layout
- Three routes under a sticky glass **NavBar**: `/` (Documents), `/ask` (chat),
  `/about` (product overview + the design/AI-usage/self-review write-ups).
- Shared app state in `lib/store.tsx` (`useApp`); components take data via props.

## Components
- Every async view: **loading / empty / error** state, always.
- Empty/error states use a colored icon medallion, not a bare grey glyph.
- Empty library state offers **"load sample document"** (D14).
- Buttons: primary = navy fill; secondary = navy outline; destructive = red text.
- Focus visible on all interactive elements (keyboard accessible).

## Voice
- Terse, plain labels. No emoji in the UI chrome. Honest empty/error copy.
