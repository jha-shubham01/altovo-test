# Altovo DocQA

Grounded document Q&A. Upload documents (or point at a URL), ask questions, and
get answers with **citations back to the exact source location**. Built for the
Altovo full-stack take-home.

- **Live demo:** _(add the Vercel production URL here)_
- **Stack:** Next.js 15 (App Router) · FastAPI (Python) · Supabase
  (Storage + Postgres + pgvector) · Gemini (embeddings + generation)
- The whole app runs on **one free Gemini API key**.

> ⚠️ **Demo caveats.** Use non-sensitive documents only — the free Gemini tier
> may train on inputs (a paid tier is required for production). The workspace is
> **shared and unauthenticated**: anyone with the URL can upload, ask, or reset.
> The keep-alive workflow stops after 60 days of repo inactivity, so the hosted
> demo has a shelf life.

---

## How it works

```
Browser (Next.js)
  ├─ upload:  sign-upload → browser PUTs file DIRECTLY to Supabase Storage → ingest
  ├─ url:     paste a URL → SSRF-guarded fetch → ingest (file or extracted page)
  └─ ask:     POST /api/ask → Server-Sent Events (sources → deltas → citations → done)

FastAPI (same Vercel project, /api/*)
  ├─ ingest:  download → re-validate (magic bytes + size) → parse (PyMuPDF /
  │           python-docx / text) → page-aware chunks (~450 tok, char spans) →
  │           embed (Gemini, 60/batch, renormalized 768-d) → store
  └─ ask:     embed question → hybrid_search (pgvector cosine + Postgres FTS,
              fused with RRF) → similarity-floor gate → Gemini stream →
              server-side citation validation

Supabase
  ├─ Storage bucket `documents/`      — original files
  └─ Postgres: documents, chunks (vector(768) HNSW + tsvector GIN), hybrid_search RPC
```

Design rationale and trade-offs: [`docs/design-note.md`](docs/design-note.md).
Full decision log: [`PLAN.md`](PLAN.md) §1. AI-usage log:
[`docs/ai-usage.md`](docs/ai-usage.md). Self-review:
[`docs/self-review.md`](docs/self-review.md).

---

## Run it locally

### Prerequisites
- Node 20+ and Python 3.11+
- A Supabase project (free tier) and a Gemini API key (free tier)

### 1. Supabase — one-time setup (human-run)
In the Supabase SQL editor, run **in order**:
1. [`supabase/schema.sql`](supabase/schema.sql) — enables `pgvector`, creates
   `documents` + `chunks` and their indexes.
2. [`supabase/hybrid_search.sql`](supabase/hybrid_search.sql) — the RRF hybrid
   retrieval function.
3. `NOTIFY pgrst, 'reload schema';` — PostgREST caches the schema, and until it
   reloads the API 404s the new table/function (`PGRST205`/`PGRST202`). The
   dashboard's "Reload schema cache" button does the same thing.

Then create a **Storage bucket** named `documents` (private).

### 2. Environment
Copy [`.env.example`](.env.example) and fill in your own keys. The service-role
Supabase key and the Gemini key are **server-side only** — never expose them to
the browser.

> **Key format gotcha:** `supabase-py 2.11` validates the key as a JWT, so use
> the **legacy `service_role` key** (the long `eyJ…` one under Project Settings
> → API → "Legacy API keys"). The new-format `sb_secret_…` key fails client
> creation with `Invalid API key` before any network call.

```bash
cp .env.example .env
# edit .env with your SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
```

### 3. Backend (FastAPI)
The app reads its config from the process environment at startup, so load
`.env` into the shell before starting uvicorn (starting it bare gives clean
503 `config_error` responses on every route):

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt uvicorn
set -a && source ../.env && set +a
uvicorn index:app --reload --port 8000
```

### 4. Frontend (Next.js)
```bash
cd frontend
npm install
# point the dev frontend at the local API:
echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:8000' >> .env.local
npm run dev   # http://localhost:3000
```

In production on Vercel the two share an origin, so `NEXT_PUBLIC_API_BASE_URL`
is left empty and `/api/*` is served by the Python function via `vercel.json`.

### 5. Try it (demo script)
The app has three routes: **Documents** (`/`), **Ask** (`/ask`), and **About**
(`/about` — the design note, AI-usage note, and self-review, in-app). For a
guided test drive, upload the three PDFs in [`test-docs/`](test-docs/) and work
through [`test-docs/QUESTIONS.md`](test-docs/QUESTIONS.md) — questions grouped
by the behavior they exercise (exact-term retrieval, a deliberate cross-document
conflict, ambiguity, "not in the documents", weak-match caveats), each with the
expected outcome. `SIM_FLOOR` was calibrated against this corpus with
[`scripts/calibrate_floor.py`](scripts/calibrate_floor.py) (see
`docs/decisions.md`).

---

## Deploy (Vercel)

Single Vercel project serves both the Next.js app and the FastAPI function
(`vercel.json` rewrites `/api/*` to the Python runtime). Set the environment
variables from `.env.example` in the Vercel project settings, then deploy.

For the keep-alive workflow, set the repo secret `APP_URL` to the production URL
(it pings `/api/health` every 3 days so the Supabase project doesn't pause).

---

## Limits (deliberate scope fences)

- Uploads: `pdf`, `txt`, `md`, `docx` only; **15 MB** and **80 pages** max.
- Questions run across **all** uploaded documents (shared workspace).
- Chat history is client-side and ephemeral; the last few turns are sent to
  generation only (retrieval stays single-query).
