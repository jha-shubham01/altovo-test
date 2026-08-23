---
name: design-system
description: Altovo DocQA UI/UX ruleset — colors, type, spacing, component and state conventions. Invoke before building or editing any frontend component.
---

# Altovo DocQA design system

Light, clean, minimal. Full spec: `docs/rules/design-system.md`. Tokens:
`frontend/tailwind.config.ts`.

## Non-negotiables
- Navy `#06152b` ink on warm cream `#f5f3ed` canvas; white surfaces.
- Blue accent `#3D6FBE` (`accent-soft` `#e9eff7`, `accent-dark` `#335ea3`).
  Single-hue blue tonal `bg-brand` for the brand mark, primary buttons and hero
  accent (not a multi-hue "AI" gradient); everything else flat. Subtle fixed
  blue wash (globals.css). Shadows: `shadow-card` / `lift` / `glow`.
- Inter font. 8px spacing grid. `rounded-lg`/`xl`/`2xl` on cards/inputs.
- **Every async view renders loading / empty / error** — no exceptions;
  empty/error use a colored icon medallion.
- Empty document library shows a "load sample document" affordance (D14).
- SourcePanel shows a per-source relevance band (green/amber/red) and a
  "weak match" caveat when similarity barely clears the floor.

## Layout & component map
- Three routes under a sticky glass NavBar: `/` (Documents), `/ask` (chat),
  `/about` (product overview + design/AI-usage/self-review write-ups).
- `components/atoms/` = presentational, local UI state only.
- `components/common/` = composed, data via props (`NavBar`, `AppShell`, …).
- Shared app state in `lib/store.tsx` (`AppProvider`/`useApp`), not per-page.
