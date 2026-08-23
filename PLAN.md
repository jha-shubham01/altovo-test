# Altovo DocQA — Build Plan

Grounded document Q&A: upload documents (or point at a URL), ask questions, get answers with citations back to the exact source location. Take-home for Altovo (Full Stack Developer, AI-Native). Time budget: 6–8 hours.

**Status: v3 — locked after four review passes (reviewer edits → author review → adversarial technical subagent review (13 findings) → assessor-lens gap review (8 findings), see §9). Living document — changes during the build get a Decision Log entry.**

---

## 1. Locked decisions & rationale (Decision Log)

| # | Decision | Choice | Why | Rejected |
|---|----------|--------|-----|----------|
| D1 | Frontend | Next.js 15 (App Router) + Tailwind, no component library | Brief requires Next.js; hand-rolled UI is easier to keep minimal/clean at this scale | shadcn/MUI (overhead, generic look) |
| D2 | Backend | Python FastAPI, deployed as native Vercel Python runtime | Brief requires Python; FastAPI is first-class on Vercel in 2026 (500 MB bundle, 300s duration, SSE works) | Flask (weaker typing/async), Docker on Vercel (adds nothing — still serverless semantics; compose unsupported), Render free (60s cold start for reviewer) |
| D3 | Deployment | Single Vercel project: Next.js + FastAPI via `vercel.json` services/rewrites. **Deploy risk retired in Phase 0**: a walking skeleton (page + API route + streamed SSE through the rewrite) must be live on the production URL by end of hour 1; if Services proves gated on Hobby, fall back same-hour to the legacy `/api`-directory Python functions pattern | One repo, one URL, no CORS, no cold-start minute; the novel config is validated first, not at hour 7.5 | Split Vercel + Render/Railway (second service to babysit; Render sleeps, Railway costs $5) |
| D4 | Storage & vectors | Supabase free tier: Storage (files, 1 GB) + Postgres (metadata/chunks, 500 MB) + pgvector (HNSW, cosine) | One vendor covers all three storage needs; durable state behind a stateless backend; hybrid search in plain SQL | Pinecone/Qdrant (extra vendor; Qdrant free deletes after 4 wks idle), sqlite-vec/Chroma (dies on stateless serverless) |
| D5 | Embeddings | Gemini `gemini-embedding-001`, 768 dims (Matryoshka-truncated, **renormalized** — 768d output isn't pre-normalized). `task_type=RETRIEVAL_DOCUMENT` at ingest, `RETRIEVAL_QUERY` at ask (asymmetric model — skipping this measurably hurts retrieval) | Free (no card), top of MTEB, official `google-genai` SDK | Voyage-4 (rate-limited until card added), OpenAI (no free tier) |
| D6 | Generation | Gemini `gemini-3.7-flash`; fallback `gemini-3-flash-lite` generation on 429. **Quota numbers are drift-prone and Google no longer publishes static tables — verify this project's live limits in the AI Studio dashboard before Phase 2; develop against flash-lite, demo on flash** | Free tier; whole app runs on ONE free API key | Claude (paid; loses the one-key story), Groq (6–12K TPM chokes on RAG contexts), OpenRouter free (models rotate) |
| D7 | Retrieval | Hybrid search: pgvector cosine + Postgres FTS, fused with RRF (k=60) in one SQL function; top 20+20 → fused top 8. All DB access via supabase-py RPC/PostgREST — **never a direct psycopg/asyncpg connection** (serverless exhausts the pool) | Vector-only is weak on exact terms; hybrid is ~30 lines of SQL and a genuine quality win | Vector-only (weaker), reranker (pays off at 10K+ chunks, not ~300 — documented next step), direct DB connections |
| D8 | Chunking | Hand-rolled recursive splitter (~40 lines): paragraph → sentence → word, target ~450 tokens, small overlap; page-aware for PDFs (never merge across pages). **Each chunk records its char span in the page text at parse time** (enables highlight-by-lookup, D11) | Keeps citations honest to the page; avoids pulling LangChain for one splitter | LangChain (framework for one function), semantic chunking (cost, no payoff at this scale) |
| D9 | Citations | Model must cite `[n]` chunk IDs from the numbered context; server validates every cited ID against the actually-retrieved set; invalid citations stripped. Chips rendered during streaming are **provisional** until the final validated `citations` event | Auditable, hallucination-resistant, model-agnostic | Free-form quotes (mismatch PDF text) |
| D10 | "Not in the docs" | Two gates: (a) best raw cosine similarity below `SIM_FLOOR` → canned "couldn't find this" response, **no LLM call**; floor calibrated empirically with real docs (~15 min — Gemini cosines cluster high, don't guess); (b) system prompt instructs refusal over improvisation. Answers whose best similarity only barely clears the floor carry a visible "weak match" caveat in the UI | Cost-aware and honest failure — both on the rubric | Always calling the LLM |
| D11 | PDF citation highlight (stretch) | Highlight is a **lookup, not a search**: chunk char spans recorded at ingest (D8); rects come from per-**sentence** `page.search_for` unioned (short needles work; a 450-token needle mostly misses on hyphenation/ligatures). Frontend: react-pdf canvas (`renderTextLayer=false`) + positioned overlay divs. Fallback ladder: rects → fuzzy recovery (rapidfuzz) → jump-to-page + snippet panel. Never show a wrong highlight | Multi-line matching solved server-side; feature actually fires instead of degrading every time | Client-side text-layer matching (breaks across spans), whole-chunk `search_for` (mostly misses), commercial viewers |
| D12 | URL data source | Paste a URL: direct file link → download (size-capped) → normal pipeline; HTML page → extract main content (trafilatura) as a document + list same-domain linked docs (cap 10) for user to confirm. No recursive crawling | Satisfies "point the app at a small data source" with a hard scope fence | Deep crawler, Google Drive (OAuth rabbit hole) |
| D13 | Chat history | Ephemeral client state. **Multi-turn resolved (was a contradiction): the client sends the last 6 turns with each `/ask`; history goes to the generation prompt only — retrieval stays single-query** (honest, documented trade-off; query rewriting is the next step) | No auth ⇒ DB persistence is globally shared — weirder than losing history | DB-persisted sessions, retrieval-aware query rewriting (deferred) |
| D14 | Question scope | Always across ALL uploaded documents; "Reset workspace" button wipes Storage + tables. Unauthenticated reset is a stated demo trade-off; **empty state offers a one-click "load sample document"** so a nuked workspace never demos empty | Simplest correct UX for a shared demo workspace | Per-doc selection UI |
| D15 | Theme | Light theme; primary `#06152b` (deep navy) on near-white canvas | Reviewer preference; clean/minimal is the bar | Dark theme |
| D16 | Providers | Gemini only — no cross-provider fallback | One vendor, one key, less code; Groq documented as next step | Groq adapter |
| D17 | Secrets | Developer (human) owns `.env` and all keys; the AI assistant never reads or writes `.env` | Security hygiene; explicit working agreement | — |
| D18 | Ingest sizing | Embedding batches of **~60 chunks (~27K tokens — under the ~30K TPM free-tier ceiling per request)**; page cap **80 pages** so worst-case ingest (~500 chunks ≈ 4–5 min of TPM-throttled embedding) stays under the 300s function cap with margin. Bigger docs rejected with a clear message; documented as a deliberate scope fence | The free-tier arithmetic must close: 100-chunk batches exceed TPM in one request, and unbounded PDFs blow the 300s cap | 100-chunk batches, unsized page cap, background/queued ingest (infra overkill here) |
| D19 | Ambiguous questions | System prompt covers the brief's second failure mode explicitly: when the question is underspecified, or retrieved sources conflict across documents, the model must **name the ambiguity** (state its interpretation, or ask one clarifying question) rather than silently picking a reading. Conflicting sources are cited on both sides | The brief names "ambiguous" verbatim next to "not in the documents" — answering only half the sentence is a visible miss | Silent best-guess answering |

---

## 2. Architecture

```
Browser — Next.js (Vercel)
 │
 ├─ file upload:  POST /api/documents/sign-upload → signed URL (uuid-prefixed path)
 │                browser PUTs file DIRECTLY to Supabase Storage   ← bypasses Vercel 4.5 MB body limit
 │                POST /api/documents/ingest {path}                ← re-validates stored object
 │
 ├─ URL source:   POST /api/documents/from-url {url}
 │
 ├─ ask:          POST /api/ask {question, history[≤6]} → SSE stream
 │
 └─ all HTTP via lib/api.ts — including a hand-rolled SSE parser over fetch
    ReadableStream (POST ⇒ no EventSource; buffers partial frames, handles abort)

FastAPI (same Vercel project, /api/*)
 │
 ├─ ingest: download from Storage → magic-byte + size re-validation
 │          → parse (PyMuPDF / python-docx / text) → page-aware chunks (~450 tok)
 │            with char spans recorded → embed (batches of ~60, task_type=
 │            RETRIEVAL_DOCUMENT, renormalize, backoff) → INSERT chunks
 │
 ├─ ask:    embed question (RETRIEVAL_QUERY) → hybrid_search() (vector+FTS, RRF)
 │          → top 8 → SIM_FLOOR gate (below ⇒ "not found", no LLM call)
 │          → gemini-3.7-flash: numbered context + last 6 turns → stream SSE
 │          → validate cited [n] against retrieved set
 │
 └─ highlight (stretch): chunk char span → per-sentence search_for → {page, rects[]}

Supabase (free tier)
 ├─ Storage bucket `documents/` — original files
 └─ Postgres: documents, chunks (+ vector(768) HNSW, tsvector GIN), hybrid_search RPC
```

### Data model

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source_type text not null check (source_type in ('upload','url')),
  source_url text,
  storage_path text,                -- null for url-page docs kept as text
  mime_type text not null,
  size_bytes bigint,
  page_count int,
  status text not null default 'processing'
    check (status in ('processing','ready','failed')),
  error text,
  created_at timestamptz not null default now()
);

create table chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  page int,                         -- 1-indexed; null for docx/txt/md/url (cited by section instead)
  section text,                     -- nearest heading at parse time (md/docx/html); null otherwise
  char_start int,                   -- span within the page text (PDF) — highlight lookup
  char_end int,
  content text not null,
  token_count int not null,
  embedding vector(768) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored
);

create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (fts);
```

`hybrid_search(query_embedding vector, query_text text, match_count int, filter_document_ids uuid[] default null)`: two CTEs (vector top 20 by cosine, FTS top 20 by `ts_rank` via `websearch_to_tsquery`), fused `1/(60+rank)`, returns chunk rows + both ranks + fused score + raw cosine similarity (needed for the D10 floor). The `filter_document_ids` param is **deliberate pre-wiring**: the app always passes NULL (D14 — all docs), but per-document scoping — the most likely "extend it live" walkthrough request — becomes a UI-only change, not a live SQL migration.

**Non-PDF attribution (explicit):** docx/txt/md/URL docs have no page numbers — the SourcePanel cites them by document + section (the `section` column captured at parse time, falling back to chunk index), and the design note owns this asymmetry rather than hiding it.

### API contract (all under `/api`, single error shape `{error: {code, message}}`)

| Method & path | Phase | Purpose | Returns |
|---|---|---|---|
| `POST /documents/sign-upload` | 1 | `{filename, size, mime}` → advisory validation → signed upload URL at uuid-prefixed path | `{path, upload_url, token}` |
| `POST /documents/ingest` | 1 | `{path, filename}` → **re-validate stored object (magic bytes + size — sign-time checks are advisory only)** → pipeline | `Document` |
| `POST /documents/from-url` | 4 | `{url}` → SSRF-guarded fetch; file → ingest; HTML → ingest page text + linked-doc candidates | `{document?, candidates?[]}` |
| `GET /documents` | 1 | list | `Document[]` |
| `DELETE /documents/{id}` | 3 | remove doc + chunks + storage object | `204` |
| `POST /ask` | 2 | `{question, history: [{role, content}] ≤6}` → SSE | events below |
| `GET /documents/{id}/highlight?chunk_id=` | 6 (stretch) | rects for a citation | `{page, page_w, page_h, rects[]}` (`rects: []` ⇒ frontend falls back) |
| `GET /documents/{id}/file` | 6 (stretch) | short-lived signed URL for the PDF viewer | `{url}` |
| `POST /reset` | 3 | nuke: truncate tables + empty bucket | `204` |

**SSE events for `/ask`**: `sources` (retrieved chunks: id, doc, page/section, snippet, score) → `delta` (text) → `citations` (validated `[n]`→chunk map; provisional chips reconciled here) → `done` | `error`. `sources` always first — retrieval necessarily precedes generation.

---

## 3. Frontend architecture

State rule: **atoms hold only local UI state; data fetching and app state live at page level; common components receive data via props.**

```
app/page.tsx                 — the single page: doc library (left) + chat (right)
components/
  atoms/     Button, Input, Badge, Spinner, FileTile, CitationChip, EmptyState, IconButton
  common/    UploadDropzone (files + URL tab), DocumentList, ChatMessage,
             ChatInput, SourcePanel (snippet + jump-to-page + per-source relevance
             band — the user-facing "how much to trust it" affordance),
             PdfViewer (stretch; lazy, client-only), ConfirmDialog
lib/
  api.ts     — ALL HTTP + the SSE-over-fetch parser; nothing else calls fetch
  types.ts   — mirrors backend Pydantic models
```

Design system (tokens in `.claude/skills/design-system`): primary `#06152b` with derived navy scale, one accent, near-white `#fafbfc` canvas; 8px spacing grid; Inter; no gradients, one subtle elevation. Every async view has explicit loading / empty / error states — enforced by ruleset. Empty library state includes "load sample document" (D14).

---

## 4. Repo layout, skills, rules

```
altovo-docqa/
  frontend/          — Next.js app
  api/               — FastAPI app (Vercel Python entry)
  supabase/          — schema.sql, hybrid_search.sql (run manually by the human)
  docs/
    rules/           — 3 rule files (below)
    decisions.md     — running decision log (feeds the submission write-ups)
    ai-usage.md      — running log too: one entry per phase (what was delegated,
                       where AI was wrong, what got corrected) — NOT reconstructed
                       from memory at hour 8
    design-note.md, self-review.md   — skeletoned (headings) in Phase 0,
                       filled as running entries, EDITED in Phase 5 — not authored there
  .claude/skills/
    design-system/   — UI/UX ruleset as an invocable skill
    codebase-guide/  — path map + guardrails skill
    ship-check/      — pre-deploy checklist skill
  .github/workflows/keepalive.yml   — pings Supabase + app every 3 days
  CLAUDE.md          — working agreements: .env rule (D17), API-calls-via-api.ts,
                       prompts only in api/prompts.py, constants in api/config.py,
                       supabase-py only (no direct DB), SSE contract pointer
  PLAN.md, README.md
```

Rules trimmed from 8 files to 3 (review finding — meta-docs were eating Phase 0): `design-system.md`, `coding-standards.md` (strict TS, no `any`, server/client component discipline; Python: Pydantic everywhere, type hints, ruff; DB via supabase-py RPC only), `security-baseline.md` (type allowlist pdf/txt/md/docx, 15 MB + 80-page caps, magic-byte re-validation, SSRF guard blocks private IPs/redirects, filenames sanitized, doc content treated as untrusted). API contract and LLM conventions live in this PLAN (§2) + `api/config.py` / `api/prompts.py` as the single sources of truth.

---

## 5. Build phases (rebalanced to 8h core; deploy risk moved to hour 1)

| Phase | Scope | Est | Cut line |
|---|---|---|---|
| 0 | Scaffold both apps + `vercel.json`; **walking skeleton DEPLOYED: page + FastAPI route + streamed SSE live through the rewrite** (fallback same-hour: legacy `/api`-directory pattern); Supabase schema SQL delivered (human runs it + creates bucket); keep-alive workflow; CLAUDE.md + 3 rules + skills (thin); **skeleton the 3 write-up docs (headings + first entries)** | 1.25h | — |
| 1 | Ingestion: sign-upload → direct upload → re-validate → parse → chunk (char spans) → embed (60/batch) → store; chunker unit tests | 1.5h | — |
| 2 | Ask: hybrid_search SQL, SIM_FLOOR calibration (15 min, real docs), Gemini streaming, SSE endpoint + api.ts parser, citation validation, history-to-generation | 1.75h | — |
| 3 | Frontend: atoms → common → page; loading/empty/error everywhere; **SourcePanel with snippet + jump-to-page + relevance band (the highlight fallback and trust affordance ship here)**; weak-match caveat; reset; sample-doc empty state (**one PDF bundled in the repo, wired through the normal ingest path**) | 1.75h | — |
| 4 | URL data source (file + HTML page + candidates) | 0.75h | degrade to direct-file-links only |
| 5 | Production deploy verification (skeleton already live since Phase 0), env setup (human), live smoke test, README; **edit** the design note / AI-usage / self-review from their running entries (authoring already done incrementally) | 1h | — |
| 6 | **Stretch:** PdfViewer + `/highlight` + `/file` endpoints, rect overlays | 1.5h | degrade to Phase-3 snippet panel (already shipped) |

Total: 8h core + 1.5h stretch. Phase 6 is the first sacrifice — the brief rewards "what I'd do next" over cramming.

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Vercel Services config fails in non-obvious ways (rewrite precedence, SSE buffering through rewrite, Hobby gating) | Walking skeleton deployed hour 1 (D3); legacy `/api`-directory fallback decided same hour |
| Supabase free project pauses after 1 week idle → dead demo | Keep-alive Action (note: GitHub disables cron after 60 days of repo inactivity — demo has a shelf life; README says so) |
| Gemini free-tier quotas drift / 429 at peak | Verify live limits in AI Studio before Phase 2; dev on flash-lite; 60-chunk batches; backoff + model fallback; 1 LLM call per question |
| Big PDF blows 300s ingest cap | 80-page / 15 MB caps sized from the TPM math (D18), clear rejection message |
| Vercel 4.5 MB body limit | Browser → Storage direct upload (never proxied) |
| LLM cites wrong/nonexistent chunk | Server-side validation (D9); provisional chips reconciled at `citations` event |
| Highlight shows wrong text | Lookup-by-span + sentence-level search; ladder ends at snippet panel — never a wrong highlight |
| Follow-up questions lose context | Last 6 turns to generation (D13); retrieval single-query, stated trade-off |
| Free-tier Gemini trains on inputs | README caveat: demo docs only; paid tier for production |
| Shared workspace, unauthenticated reset | Stated demo trade-off; sample-doc empty state so a nuked workspace never demos empty |

## 7. Deliberately deferred (goes in the design note)

Reranking (worth it at 10K+ chunks), auth/multi-tenancy, **rate limiting & abuse caps** (open `/ask` burns the free key; open `/reset` nukes the workspace — first things to fix for production), **structured logging & monitoring** (request IDs, LLM latency/token metrics, error tracking), DB-persisted chat, query rewriting/multi-turn retrieval, background/queued ingest for big docs, eval harness (small golden Q&A set per doc), OCR for scanned PDFs, recursive crawling, cross-provider LLM fallback, semantic chunking, non-English FTS.

## 8. Submission deliverables mapping

- **Live URL** — Vercel production (live from Phase 0, verified Phase 5)
- **Repo + README** — local run incl. supabase schema step
- **Design note** — distilled from §1 + §7
- **AI-usage note** — from `docs/ai-usage.md`, the per-phase running log: what was delegated (research agents, scaffolding, adversarial plan review), where the model was wrong and got corrected
- **Self-review (PR-style)** — trade-offs (§1), known weaknesses (§6, shared workspace, English-only FTS, section-level non-PDF citations), "with another week" (§7)

## 9. Plan changelog

- **v3** — assessor-lens gap review (coverage vs the brief), 8 findings folded in. Gaps: D19 added (ambiguous questions — name the ambiguity / ask one clarifier; brief names this verbatim); trust made user-facing (SourcePanel relevance band + weak-match caveat — scores were streamed but never shown); rate limiting + logging/monitoring added to §7 so the production-readiness write-ups inherit them. Consistency: `section` column added so "cite by nearest heading" has a data path; `docs/ai-usage.md` becomes a per-phase running log; sample doc given a mechanism (bundled PDF through normal ingest); `hybrid_search` pre-wired with optional `filter_document_ids` (NULL = all) so per-doc scoping is a UI-only live extension; write-ups skeletoned in Phase 0 so Phase 5 is editing, not authoring.
- **v2** — adversarial subagent review, 13 findings folded in. Majors: walking-skeleton deploy moved to Phase 0; ingest arithmetic closed (60-chunk batches, 80-page cap vs ~30K TPM / 300s); highlight redesigned from whole-chunk search to span-lookup + per-sentence search; Gemini quota numbers marked drift-prone (AI Studio dashboard = source of truth, dev on flash-lite); multi-turn contradiction resolved (history → generation only). Minors: uuid upload paths + magic-byte re-validation; SSE-over-fetch parser named in api.ts; `task_type` + renormalization + empirical SIM_FLOOR; highlight endpoints assigned to Phase 6 and snippet fallback to Phase 3; non-PDF section-level citations owned; keep-alive 60-day note + sample-doc empty state; supabase-py-only DB rule; rules 8→3 files; phases rebalanced to 8h.
- **v1** — initial plan after two human/author review cycles.
