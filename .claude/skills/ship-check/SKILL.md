---
name: ship-check
description: Pre-deploy checklist for Altovo DocQA. Invoke before pushing a deploy or marking a phase done.
---

# Ship check

Run before every deploy / phase completion.

## Build
- [ ] `cd frontend && npm run build` passes (no type errors, no lint errors).
- [ ] `cd api && ruff check .` clean; `python -c "import index"` imports.
- [ ] Chunker unit tests pass (`python -m pytest tests/ -q` from the repo root).

## Contract
- [ ] `api/models.py` and `frontend/lib/types.ts` still agree.
- [ ] SSE order holds: sources → delta* → citations → done | error.
- [ ] Single error shape `{error:{code,message}}` on every failure path.

## Safety
- [ ] Type allowlist + size + page caps enforced at ingest (magic-byte check).
- [ ] SSRF guard blocks private IPs and redirect hops.
- [ ] No secrets in `NEXT_PUBLIC_*`; `.env` not committed.
- [ ] Citations validated server-side; invalid `[n]` stripped.

## Demo readiness
- [ ] Sample document loads through the normal ingest path.
- [ ] Empty / loading / error states render on every async view.
- [ ] Reset workspace works; keep-alive workflow committed.
- [ ] README local-run steps include the Supabase schema step.
