# AI-usage log (running, per phase)

One entry per phase: what was delegated, where the AI was wrong, what got
corrected. Written as we go — not reconstructed at the end.

## Phase 0 — scaffold
- **Delegated:** repo scaffolding, `vercel.json`, Supabase schema + hybrid
  search SQL, config/prompts/models contract, rules and skills, doc skeletons.
- **Human-owned:** all keys and `.env` (D17); running the Supabase schema;
  creating the Storage bucket; the Vercel deploy.
- **Corrections / watch-items:** Gemini model IDs and free-tier quotas are
  drift-prone (D6) — to be verified against AI Studio before Phase 2. Vercel
  Python ASGI config is the deploy risk (D3) — validated by the walking
  skeleton before anything else is built on it.

## Build approach
Two subagents ran in parallel against a locked contract (`api/models.py`,
`api/config.py`, `api/prompts.py`, `frontend/lib/types.ts`, PLAN §2): one for the
FastAPI backend, one for the Next.js frontend. Establishing the contract *first*
is what let them work independently without interface drift.

- **Where the agents struggled:** both dropped repeatedly on a transient API
  connection error mid-run. The frontend agent was resumed with its context and
  finished cleanly. The backend agent kept dropping, so the remaining backend
  modules were authored directly in the main thread rather than fighting the
  flakiness — a deliberate reliability call.

## Phase 1 — ingestion
- **Delegated → then hand-finished:** parsing (PyMuPDF page-aware / python-docx /
  text), the recursive chunker, embedding batching, the Supabase access layer.
- **Where AI was wrong / corrected:**
  - The chunker's first overlap implementation re-seeded a whole trailing unit,
    so near-target units produced ~2× chunks. Caught by a unit test asserting
    per-chunk token size; fixed by moving to offset-based packing with a bounded
    character-level overlap, and by keeping words atomic when splitting an
    oversized punctuation-free sentence. All 8 chunker tests pass.
  - **Human-verify:** the exact `google-genai` SDK surface for
    `embed_content` batching and `generate_content_stream` (marked `# VERIFY` in
    `embedding.py` / `gemini.py`) — written best-effort, untestable here without
    a key (D17).

## Phase 2 — ask
- SSE pipeline (`ask.py`), hybrid retrieval + SIM_FLOOR gate (`retrieval.py`),
  server-side citation validation (regex `[n]` ∩ retrieved set), the canned
  no-LLM not-found path.
- **Corrected:** the `sources` SSE payload originally carried only the truncated
  snippet, which the LLM would then have to reason over — added a separate
  `context_passages` (full content) so the prompt gets full text while the wire
  payload stays lean.
- **Human-verify:** `SIM_FLOOR` is seeded at 0.55 and must be calibrated with
  real docs (`scripts/calibrate_floor.py`, D10).

## Phase 3 — frontend
- All atoms + common components + the single page; the hand-rolled SSE-over-fetch
  parser (partial-frame buffering, abort, malformed-frame tolerance).
- **Corrected:** the agent loaded the bundled sample doc with a raw `fetch()` in
  `page.tsx`, breaking the "all HTTP via `lib/api.ts`" hard rule. Moved it into
  `fetchLocalFile()` in `api.ts`. Build + type-check green; UI verified in-browser
  (renders the correct empty/error states).

## Phase 4 — URL source
- SSRF-guarded fetch with per-redirect-hop re-checking and a streamed byte cap;
  direct-file vs HTML-page branch; same-domain linked-doc candidates (capped).
- **Human-verify:** confirming a candidate re-calls `/documents/from-url` with
  the candidate URL (frontend assumption, matches the backend path).

## Phase 5 — deploy & docs
- `vercel.json`, root `requirements.txt`, `docs/DEPLOY.md`, README, this log.
- **Could not runtime-validate the Vercel config (D3)** — no deploy creds here.
  The single live-validation step (does the rewrite deliver `/api/health` to
  FastAPI with the path intact?) and its fallback are written up in
  `docs/DEPLOY.md` for the human to run as the walking skeleton.
- **Human-verify:** the signed-upload PUT shape — `uploadToStorage` PUTs with
  `Authorization: Bearer <token>`; confirm this matches Supabase's
  signed-upload-URL contract (some flows want the token as a query param /
  `x-upsert` header).

## Post-build — UI overhaul (product-owner feedback)
- **Feedback:** the first UI was too plain/empty and single-page; asked for
  separate upload vs. chat pages, a nav bar, and a richer (but still beautiful)
  theme. Implemented directly in the main thread (fast visual-iteration loop with
  the in-app browser: built → screenshotted `/` and `/ask` on desktop + mobile →
  adjusted). Split into `/` + `/ask` with a shared `AppProvider`, added a glass
  NavBar, an indigo→violet brand gradient, a soft background wash, colored
  medallions and hover motion. Logged as a living-doc change (supersedes parts of
  D1/D15) in `decisions.md`; design rule + skill updated.

## Post-build — code review (subagents)
- **Delegated:** two read-only review subagents (backend, frontend) ran the
  real tooling (`ruff`, `pytest`, no-env import check; `tsc`, `next lint`) and
  audited both against the PLAN contract, reporting gaps ranked by severity.
- **Found / fixed:** no criticals. Real bugs fixed — non-PDF ingest budget,
  library-wipe on transient poll error, earlier-turn citations, mobile Sources
  panel, history-unit drift, CRLF SSE framing, plus hygiene (tunables → config,
  dead code, ESLint). SSRF TOCTOU + thin test coverage documented as accepted.
- **Where AI needed steering:** the frontend review correctly flagged the
  history-unit ambiguity as a *decision* rather than a bug — I resolved it
  (6 turns = 12 messages) rather than letting either side "win" silently.

## Phase 6 — stretch (PDF highlight)
- `highlight.py` (span lookup → per-sentence `search_for` → union, rapidfuzz
  fallback, empty-rects-means-fall-back) + the `/highlight` and `/file`
  endpoints. Frontend `PdfViewer` shipped in two passes: first a single-page
  modal with rect overlays, then (delegated to a subagent against a written
  spec) a full-document viewer — every page lazily mounted via
  IntersectionObserver windowing, instant auto-scroll centering the first
  highlight rect, overlays only on the cited page, live "Page X of Y".
  Human-verified end-to-end in the browser.

## Post-build — live bring-up (where AI was wrong, and caught it)
The most instructive AI-usage material came from getting the app live against
real keys (human owned all secrets throughout, D17):

- **Stale model ID shipped as a default.** The AI's original fallback
  generation model ID didn't exist on the live API (404). Surfaced the moment
  the primary rate-limited; fixed by verifying against the live model list and
  correcting both the config default and `.env.example`. Lesson: model IDs are
  drift-prone facts, not things to trust from training data (this was flagged
  as a risk in D6, and it still bit).
- **"Slow model" was actually a transport bug.** Asks intermittently hung
  forever on "Searching…". The AI's first instinct (model latency) was wrong;
  systematic isolation (curl vs httpx on the same endpoint) showed the
  resolver intermittently returning IPv6 first and httpx — no happy-eyeballs —
  hanging on an unroutable route, while curl raced both families. Fix: pin the
  SDK transport to IPv4 + a hard per-request timeout so failures surface as
  SSE error events instead of hangs. Measured after: embeds 0.7–0.9s, full ask
  3.3–4.5s.
- **Latency win from reading the model's behavior.** First-token latency was
  dominated by the model's silent "thinking" phase; setting
  `thinking_budget=0` for grounded RAG answers cut seconds off every reply —
  with a guard that retries once without the override for models that reject
  it (a generic 400, discovered live when the fallback model refused it).
- **Environment overrides beat code fixes.** After the fallback-model fix, the
  human's `.env` still pinned the old ID (copied from the earlier
  `.env.example`) — the error looked identical, but the cause was config
  precedence, not code. Worth remembering when "the fix didn't work."

## Post-build — pre-submission audit (subagent)
- A read-only subagent audited the whole repo against the assignment brief
  (deliverables, the brief's "worth thinking about" list, walkthrough risks).
  It caught: a half-finished self-review, this log's Phase 6 entry claiming
  the viewer was still a stub after it had shipped, stale `VERIFY` comments,
  an uncalibrated-but-claimed SIM_FLOOR, a misleading "rerank fusion" label in
  the hero (RRF is rank fusion, not a reranker), README run-steps that would
  trip a reviewer, and a real bug (`reset_all` not actually emptying the
  storage bucket). All fixed in the pre-submission pass.
