# Deploy notes

## Single Vercel project (D3)

One project serves both apps:

- **Next.js** builds from `frontend/` (`vercel.json` → `buildCommand`,
  `outputDirectory: frontend/.next`).
- **FastAPI** is a Python serverless function at the repo-root `api/index.py`
  (Vercel auto-detects `/api`). `requirements.txt` at the root pulls in
  `api/requirements.txt`.
- `vercel.json` rewrites `/api/(.*)` → `/api/index`, so every API path is served
  by the single FastAPI ASGI `app`. Routes are declared under `/api/...`, which
  also matches local dev (`uvicorn index:app` on `:8000`).

Set the env vars from `.env.example` in the Vercel project settings (server-side
only — never `NEXT_PUBLIC_*` for the service key). Leave
`NEXT_PUBLIC_API_BASE_URL` empty in production (same origin).

## The one thing to validate live (walking skeleton, hour 1)

This is the acknowledged deploy risk (D3). Deploy a trivial version first and
confirm, **on the production URL**:

1. The Next.js page renders.
2. `GET /api/health` returns `{"status":"ok"}` — i.e. the rewrite reaches the
   FastAPI app **and the app sees the path as `/api/health`** (not a stripped or
   rewritten path). If the function receives a different path, either:
   - adjust the rewrite `destination`, or
   - set FastAPI `root_path`, or
   - **fall back** to the legacy per-file `/api` functions pattern (one file per
     route) — decided same hour, per D3.
3. An SSE response from `/api/ask` streams through the rewrite without being
   buffered whole (the `X-Accel-Buffering: no` header is set for this).

Only build the rest on top once the skeleton is green.

## Keep-alive

Set the repo secret `APP_URL` to the production URL. The workflow in
`.github/workflows/keepalive.yml` pings `/api/health` every 3 days so the
Supabase free project doesn't pause. GitHub disables scheduled workflows after
60 days of repo inactivity — the hosted demo has a shelf life (README says so).
