# Design note

## What it is
Grounded document Q&A: upload documents (or point at a URL), ask questions, get
answers with **citations back to the exact source location**.

## Architecture at a glance
Next.js (App Router) + FastAPI on a single Vercel project (no CORS, one URL).
Supabase for Storage + Postgres + pgvector. Gemini for embeddings and
generation — the whole app runs on one free API key.

## Key decisions (why)
- **Page-aware chunking with recorded spans** — a hand-rolled recursive splitter
  (paragraph → sentence → word, ~450 tokens with small overlap) that never
  merges across PDF pages, and records each chunk's char span in its page text
  at parse time. That keeps citations honest to the page and makes PDF
  highlighting a *lookup*, not a fragile text search. Non-PDF types carry the
  nearest heading as a `section` instead.
- **Hybrid retrieval** (pgvector cosine + Postgres FTS, fused with RRF) — vector
  alone is weak on exact terms; hybrid is ~30 lines of SQL and a real quality
  win at this scale. Retrieval over-fetches (top-8) for model recall; the UI
  shows cited passages first, capped at 5, for reader precision.
- **Citations are validated server-side** — the model cites `[n]` IDs from a
  numbered context; the server strips any ID not in the retrieved set. Chips
  shown mid-stream are provisional until the final `citations` event.
- **Two honesty gates** — a similarity floor short-circuits "not in the docs"
  with no LLM call; the system prompt refuses over improvising and names
  ambiguity instead of guessing.
- **Direct-to-Storage upload** — the browser PUTs files straight to Supabase,
  bypassing Vercel's 4.5 MB body limit.
- **Fast and cost-aware by construction** — one LLM call per question (the
  floor gate answers "not found" with zero calls), embedding batches sized to
  the free-tier TPM ceiling, the model's silent "thinking" phase disabled for
  grounded answers (seconds off first-token latency), and a hard per-request
  timeout so a bad network route fails fast instead of hanging the stream.

## Known asymmetries (owned, not hidden)
- Non-PDF docs (docx/txt/md/URL) have no page numbers — cited by document +
  nearest section instead.
- Shared, unauthenticated workspace — reset is global; a stated demo trade-off.
- English-only FTS.
- SSRF guard validates every resolved hop but is resolve-then-fetch, so DNS
  rebinding (TOCTOU) isn't covered — acceptable here, noted for production.

## What I'd do next
See `PLAN.md` §7: reranking, auth/multi-tenancy, rate limiting + abuse caps,
structured logging/monitoring, DB-persisted chat, query rewriting for multi-turn
retrieval, background/queued ingest, an eval harness, OCR, cross-provider
fallback.
