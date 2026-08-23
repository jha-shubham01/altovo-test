---
name: codebase-guide
description: Path map and guardrails for the Altovo DocQA repo. Invoke to find where a thing lives or before adding a new module.
---

# Altovo DocQA codebase guide

## Where things live
- `frontend/app/page.tsx` — Documents route (upload + library).
- `frontend/app/ask/page.tsx` — Ask route (chat + sources).
- `frontend/lib/store.tsx` — `AppProvider`/`useApp`: shared documents + chat state.
- `frontend/components/common/AppShell.tsx` — nav bar + global confirm dialog.
- `frontend/components/atoms/` — presentational atoms (local UI state only).
- `frontend/components/common/` — composed components (data via props).
- `frontend/lib/api.ts` — ALL HTTP + the SSE-over-fetch parser.
- `frontend/lib/types.ts` — TS mirror of `api/models.py`.
- `api/index.py` — FastAPI ASGI entrypoint (Vercel Python function).
- `api/config.py` — every constant/limit. `api/prompts.py` — every prompt.
- `api/models.py` — Pydantic contract. `api/db.py` — supabase-py client.
- `api/ingest.py`, `api/ask.py`, `api/parsing.py`, `api/chunking.py`,
  `api/embedding.py`, `api/retrieval.py`, `api/gemini.py` — pipeline modules.
- `supabase/*.sql` — schema + hybrid_search RPC (human runs once).

## Guardrails
- `.env` is developer-owned — never read/write it (D17).
- HTTP only via `lib/api.ts`; prompts only in `prompts.py`; constants only in
  `config.py`; DB only via supabase-py RPC.
- Keep the API contract (§2 of PLAN.md) and `models.py`/`types.ts` in lockstep.
