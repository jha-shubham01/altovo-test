# Self-review (PR-style)

## Summary
Grounded document Q&A with citations. Hybrid retrieval (pgvector + FTS fused
with RRF), server-validated citations, two honesty gates, direct-to-Storage
upload, full-document PDF viewer with exact-rect citation highlights,
single-Vercel-project deploy. Runs on one free Gemini key.

## Trade-offs made (and why)
- **Shared, unauthenticated workspace** — reset is global. Simplest correct UX
  for a demo; the one-click sample doc means a nuked workspace never demos
  empty.
- **History goes to generation only; retrieval stays single-query.** Honest,
  documented trade-off — query rewriting for multi-turn retrieval is the
  natural follow-up.
- **Non-PDF docs (docx/txt/md/URL) are cited by section, not page rects** — an
  owned asymmetry, not hidden.
- **English-only full-text search**; page/size caps (80 pages / 15 MB, plus a
  char cap for page-less types) sized from the free-tier token-per-minute math.
- **Top-8 retrieval shown as top-5 cited-first in the UI** — recall for the
  model, precision for the reader; the panel distinguishes "cited" from
  "also checked".

## Known weaknesses
- **Shared workspace, no auth** — reset nukes everyone's docs.
- **No rate limiting** — an open `/ask` burns the free key and an open
  `/reset` nukes the workspace; first things to fix for production.
- **English-only FTS** — `to_tsvector('english', …)`; other languages fall
  back to vector-only relevance.
- **Section-level citations for non-PDF** — no page rects for docx/txt/md/URL.
- **SSRF guard is resolve-then-fetch** — every URL/redirect hop is validated,
  but httpx re-resolves DNS on connect, so a DNS-rebinding host isn't caught
  (TOCTOU). Acceptable for a take-home; a production fix pins the resolved IP
  or uses an egress allowlist/proxy.
- **Thin automated test coverage** — the chunker is unit-tested; retrieval,
  the SIM_FLOOR gate, citation validation, SSRF and SSE framing are covered by
  code review + live manual smoke tests (see `docs/decisions.md` for the
  measured runs), not by CI tests.

## What I'd do with another week
- Rate limiting + abuse caps; structured logging & monitoring (request IDs,
  LLM latency/token metrics, error tracking).
- A reranker (pays off at 10K+ chunks), query rewriting for multi-turn
  retrieval, and a small golden-Q&A eval set per document (`test-docs/` +
  `QUESTIONS.md` is the seed of exactly that).
- Auth with per-user workspaces; OCR for scanned PDFs; background/queued
  ingest for large docs; cross-provider LLM fallback; non-English FTS.

## Test notes
- Chunker: unit-tested (span round-trip, page boundaries, overlap, sizing).
- Retrieval + generation: live-verified end-to-end (cited answers, exact-term
  codes, cross-doc conflict, refusal, weak-match) against the bundled
  `test-docs/` corpus using `test-docs/QUESTIONS.md`; measured latencies and
  the transport/latency fixes are recorded in `docs/decisions.md`.
- SIM_FLOOR: calibrated against the live corpus with
  `scripts/calibrate_floor.py` — see `docs/decisions.md` for the measured
  distribution and the chosen floor.
- Manual smoke: upload → ask → cited answer → PDF viewer highlight /
  jump-to-source; reset; URL ingest.
