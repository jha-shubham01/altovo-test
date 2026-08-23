# Coding standards

## TypeScript / React
- `strict` mode; **no `any`** (use `unknown` + narrowing). No non-null `!` on
  values that can genuinely be null — handle the null.
- Server Components by default; add `"use client"` only when a component uses
  state, effects, or browser APIs.
- **State rule:** atoms hold only local UI state. Data fetching and shared app
  state live in the app-level provider (`lib/store.tsx`, `AppProvider`/`useApp`);
  common components receive data via props.
- All HTTP through `lib/api.ts`. Components never call `fetch`.
- Every async view renders explicit **loading / empty / error** states.
- Prefer composition over config objects; keep components small.

## Python
- Type hints on every function signature; Pydantic models for all request and
  response bodies (no bare dicts across the wire).
- `ruff` clean (imports sorted, no unused, line length 100).
- Prompts only in `prompts.py`; constants only in `config.py`.
- **DB access via supabase-py RPC / PostgREST only** — never psycopg/asyncpg.
- Errors returned as `{error: {code, message}}`; raise typed exceptions and let
  the FastAPI handlers shape them.

## General
- Small, single-purpose functions. Comments explain *why*, not *what*.
- No dead code, no commented-out blocks left behind.
- Match the surrounding style; don't reformat unrelated lines.
