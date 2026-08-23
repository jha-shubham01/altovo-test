# Decision log (running)

The authoritative decision table lives in `PLAN.md` §1 (D1–D19). This file
records decisions made *during the build* that change or extend the plan.

## Phase 0 — scaffold

- Adopted the plan's D1–D19 as-is; no changes needed to start.
- **Vercel Python entrypoint:** single `api/index.py` exposing a FastAPI ASGI
  `app`; `vercel.json` rewrites `/api/(.*)` to it. FastAPI declares its routes
  under the `/api` prefix so paths match end to end. Fallback (if Services/ASGI
  proves gated) is the legacy per-file `/api` functions pattern — decided but
  not needed unless the skeleton deploy fails.
- **SIM_FLOOR** seeded at `0.55` pending empirical calibration in Phase 2
  (`scripts/calibrate_floor.py`).

## Phases 1–6 — build

- **`context_passages` added to the retrieval result** (not in the original
  contract): the `sources` SSE event carries a truncated snippet for the UI, but
  the LLM prompt needs full chunk text. Retrieval now returns both — full content
  for the prompt, snippet for the wire.
- **pgvector as a text literal.** Embeddings are passed to inserts and to the
  `hybrid_search` RPC as the `[v1,v2,...]` text literal (`db.to_vector_literal`)
  so PostgREST casts them unambiguously to `vector`, rather than relying on JSON
  array → vector coercion.
- **Chunk overlap is character-level, not unit-level** (see ai-usage Phase 1):
  offset-based packing to target, then each chunk (bar the first) is extended
  left by ~`CHUNK_OVERLAP_TOKENS` worth of characters snapped to a word boundary.
  Keeps the `text[char_start:char_end] == content` invariant that the highlight
  lookup depends on (D11).
- **Document row created only after a successful parse** yields ≥1 chunk, so
  rejected files (bad type / too many pages / no text) return a clean 4xx with no
  orphan row; failures *during embedding* mark the row `failed`.
- **All fetch centralised** — the sample-doc loader was moved out of `page.tsx`
  into `api.ts` (`fetchLocalFile`) to keep the "no other file calls fetch" rule
  literally true.
- **Vercel deploy config (D3) is authored but unvalidated here** — no deploy
  creds in the build environment. The live walking-skeleton check + fallback are
  documented in `docs/DEPLOY.md`.

## UI overhaul (post-build, on request) — supersedes parts of D1/D15

Direct product-owner instruction after the first build; logged here as a living
change (PLAN.md D1 said "single page", D15 said "no gradients, minimal").

- **Multi-page + navigation bar.** Split the single page into `/` (Documents:
  upload + library) and `/ask` (chat + sources), tied together by a sticky glass
  `NavBar` with active-route state. Shared state (documents + chat) moved into an
  app-level client provider (`lib/store.tsx`, `useApp()`), so it survives
  navigation — the state rule becomes "state in one app-level provider" rather
  than "at the single page".
- **Richer theme, then re-palette.** First pass added depth + motion. On
  follow-up feedback ("the indigo/violet reads as a generic AI-agent look") the
  palette was reset to a specified brand set: **accent `#3D6FBE` (blue), canvas
  `#f5f3ed` (warm cream), white surfaces**, deep navy ink for text. The
  multi-hue gradient was replaced by a single-hue blue tonal for the brand mark
  / primary buttons only; the background wash was toned down to a faint blue.
  This still relaxes D15's "no gradients", but toward an editorial, warmer look.
  Tokens, `globals.css`, the design rule and skill updated to match.
## Post-review hardening

Two subagents ran a read-only code review + the test/lint tooling over the
backend and frontend. No criticals; contract adherence and hard rules verified.
Fixes applied from the findings:

- **Non-PDF ingest budget** (`config.MAX_TEXT_CHARS` + `parsing._enforce_text_budget`):
  txt/md/docx are now capped by total text length, closing the D18 time-budget
  gap the 80-page cap only covered for PDFs (a huge plaintext dump no longer
  risks a 300s timeout + stuck `processing`).
- **History unit reconciled** to "6 turns = up to 12 messages": frontend slices
  `MAX_HISTORY_TURNS*2`, backend generation keeps `*2`, `AskRequest.history`
  cap stays 12 (comment clarified). D13 intent, no more surface drift.
- **Library resilience:** a transient poll/delete failure no longer wipes a
  populated document list to a full-page error — it keeps the list and shows a
  small "couldn't refresh" banner.
- **Citations in earlier turns** now resolve: clicking a chip repoints the
  Sources panel to that message's answer, not only the latest.
- **Sources on mobile:** the panel stacks below the chat instead of being
  hidden below `lg`, so citations have a fallback on small screens (D11).
- **SSE parser** normalises CRLF→LF so the `\n\n` frame boundary holds even if
  an intermediary rewrites line endings.
- **Hygiene:** stray tunables (snippet length, retry schedule, redirect-hop cap,
  insert batch, highlight needle bounds) moved into `config.py`; dead
  `config._require` removed; ESLint configured (`next lint` now runs clean).

Documented-only (accepted for a take-home, see design-note / self-review):
the SSRF guard is resolve-then-fetch (DNS-rebinding TOCTOU), and test coverage
is chunker-only (retrieval/gate/citation/SSRF/SSE untested; the two google-genai
SDK call sites remain unverified without keys).

## Live-testing fixes (first real end-to-end runs)

- **Fallback model ID was wrong** (D6 drift, exactly as predicted): default
  `gemini-3-flash-lite` doesn't exist on the live API — every rate-limited
  primary call died on the fallback. Now `gemini-flash-lite-latest` (alias,
  drift-proof), verified against live ListModels.
- **First-token latency**: flash models "think" silently by default. Upgraded
  `google-genai` 0.8.0 → 2.19.0 and set `thinking_budget=0` (guarded — degrades
  gracefully on SDKs/models without it). Measured: sources→first-token gap
  dropped from 5–10s to ~1.8s.
- **Streaming UX**: phased indicator in the answer bubble ("Searching your
  documents…" → "Reading the sources…"), skeleton cards in the Sources panel
  while retrieval runs.
- **Refusal vs sources mismatch**: when the LLM refuses above the floor, the
  retrieved-but-uncited passages now carry an explanatory note ("checked, but
  not cited") instead of appearing to contradict the answer.
- **PDF viewer shipped (Phase 6)**: react-pdf modal opens the cited page via
  `/file` + `/highlight`, overlays scaled rects; ladder degrades to page-only,
  then snippet (non-PDF/failure). Worker bundled in `public/`.

## Sources panel: answer-first, cited-first (UX feedback)

Feedback: all 8 retrieved passages rendered as "sources" even when only one
was cited — and on refusals the panel flashed passages then hid them.
Root framing: retrieval intentionally over-fetches (top-8, recall for the
model); the UI was presenting the model's working set as the answer's sources.
Changes:
- The panel shows a skeleton while the answer streams and only renders
  passages after the validated `citations` event — answer first, so a refusal
  never flashes sources it then hides.
- After completion: cited passages first with a "Cited" badge, the rest dimmed
  as "Checked"; display capped at `SOURCE_DISPLAY_LIMIT` (5) with a
  "N more checked but not shown" footnote. Header pill now counts citations,
  not passages.
- Retrieval itself is unchanged (still top-8 to the model).

## The hang that looked like a slow model (transport bug)

Symptom: asks intermittently stuck on "Searching your documents…" forever.
Root cause was NOT the model or SDK version: the resolver here intermittently
returns an IPv6 answer first, httpx (used by google-genai) has no
happy-eyeballs, and the unroutable IPv6 connect hangs indefinitely — while
`curl` (which races both address families) always succeeded in <1s. Fix in
`genai_client.py`: pin the SDK's httpx transport to IPv4 via
`HTTPTransport(local_address="0.0.0.0")` plus a hard per-request timeout
(`GENAI_HTTP_TIMEOUT_SECONDS`) so any future bad route fails fast into the SSE
`error` event instead of hanging the stream. Measured after: embeds 0.7–0.9s
(was 2–3s when it worked at all), full ask 3.3–4.5s end-to-end, no hangs
across repeated fresh-process runs.

## SIM_FLOOR calibration (D10, run live)

Ran `scripts/calibrate_floor.py` against the ingested `test-docs/` corpus with
the API started under `SIM_FLOOR=0` (the gate otherwise empties sources for
below-floor questions, so the out-of-domain side would read 0.0):

- **In-domain** (8 questions across all three docs): best cosine **0.630–0.718**.
- **Truly off-topic** (capital of France, sourdough, World Cup, workouts,
  favourite color): **0.498–0.559**.
- **Topically adjacent but unanswered** ("parental leave policy" against an HR
  handbook that doesn't cover it): **0.661** — above any workable floor. This
  is structural: embedding similarity measures topic, not answerability. Such
  questions are the job of gate (b), the prompt-level refusal — verified live
  (the model refuses and cites nothing, and the UI shows "No sources used").

Chosen: **SIM_FLOOR = 0.60** (clean gap between 0.559 and 0.630) with
`WEAK_MATCH_MARGIN = 0.03` (weak-match caveat below 0.63). Updated
`config.py` defaults; the earlier 0.55 seed and "pending calibration" note are
superseded by this entry.

## About route

Added `/about` (linked in the NavBar) — a styled overview
  ("what it does / how it works / trust / under-the-hood / limits") followed by
  the three submission write-ups (design note, AI-usage, PR-style self-review)
  on one page. (Briefly shipped as separate `/readme` + `/notes` routes, then
  folded into one `/about` on request.)
