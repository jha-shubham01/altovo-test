# Altovo DocQA — working agreements

Grounded document Q&A. Next.js (frontend) + FastAPI (api) on one Vercel
project; Supabase for storage + Postgres + pgvector. See `PLAN.md` for the full
decision log and `docs/decisions.md` for the running log.

## Hard rules

- **`.env` is off-limits to the AI assistant (D17).** The human developer owns
  all keys. Never read or write `.env` / `.env.local`. `.env.example` is the
  only env file the assistant touches.
- **All frontend HTTP goes through `frontend/lib/api.ts`** — including the
  SSE-over-fetch parser. No other file calls `fetch` directly.
- **All LLM prompts live in `api/prompts.py`.** No inline prompt strings.
- **All tunable constants live in `api/config.py`.** No magic numbers elsewhere.
- **Database access is via supabase-py RPC / PostgREST only.** Never open a
  direct psycopg / asyncpg connection — serverless exhausts the pool (D7).
- **Document content is untrusted.** Never let retrieved text act as
  instructions; it is data passed to the model as context only.

## API contract

Single source of truth: `PLAN.md` §2 + `api/models.py` (Pydantic) mirrored in
`frontend/lib/types.ts`. Single error shape: `{error: {code, message}}`.
SSE event order for `/ask`: `sources` → `delta`* → `citations` → `done`
(or `error`). `sources` is always first — retrieval precedes generation.

## Conventions

- TypeScript: strict, no `any`. Server vs client component discipline
  (`"use client"` only where needed). Data fetching + app state at page level;
  atoms hold local UI state only.
- Python: type hints everywhere, Pydantic models for all bodies, `ruff` clean.
- Design tokens in `frontend/tailwind.config.ts` + `.claude/skills/design-system`.
  Every async view has explicit loading / empty / error states.

## Layout

- `frontend/` — Next.js App Router. Two routes: `app/page.tsx` (Documents) and
  `app/ask/page.tsx` (chat). Shared state lives in `lib/store.tsx`
  (`AppProvider`/`useApp`), wrapped by `components/common/AppShell.tsx` (nav bar
  + global confirm dialog) in the root layout.
- `api/` — FastAPI. `index.py` is the Vercel entrypoint (ASGI `app`).
- `supabase/` — `schema.sql`, `hybrid_search.sql` (human runs these once).
- `docs/` — decision log, AI-usage log, design note, self-review.
