"""Central configuration and tunable constants for the Altovo DocQA API.

This module is the single source of truth for every magic number and limit.
Nothing else in the codebase should hard-code these values.

Environment variables are owned by the human developer (D17); this module only
reads them. It never writes .env.
"""

from __future__ import annotations

import os


def _optional(name: str, default: str) -> str:
    return os.environ.get(name, default)


# --- Supabase -------------------------------------------------------------
# The service-role key is used server-side only (never shipped to the client).
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET = _optional("SUPABASE_STORAGE_BUCKET", "documents")

# --- Gemini ---------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

EMBEDDING_MODEL = _optional("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIMS = 768  # Matryoshka-truncated; renormalized after truncation (D5)

# Generation: develop against flash-lite, demo on flash. Fallback on 429 (D6).
GENERATION_MODEL = _optional("GEMINI_GENERATION_MODEL", "gemini-3.7-flash")
# "-latest" alias survives model-ID drift (D6: IDs are drift-prone; verified
# against the live ListModels for this key — "gemini-3-flash-lite" didn't exist).
GENERATION_FALLBACK_MODEL = _optional(
    "GEMINI_GENERATION_FALLBACK_MODEL", "gemini-flash-lite-latest"
)

# --- Ingestion limits (D18) ----------------------------------------------
# Free-tier arithmetic must close: batches stay under the ~30K TPM request
# ceiling, and the page cap keeps worst-case ingest under the 300s function cap.
MAX_FILE_BYTES = 15 * 1024 * 1024      # 15 MB hard cap
MAX_PAGES = 80                          # reject bigger PDFs with a clear message
EMBED_BATCH_SIZE = 60                    # ~27K tokens/request, under 30K TPM
CHUNK_TARGET_TOKENS = 450                # target chunk size
CHUNK_OVERLAP_TOKENS = 60                # small overlap between chunks
# Heuristic chars-per-token for the hand-rolled tokenizer estimate.
CHARS_PER_TOKEN = 4
# Non-PDF (txt/md/docx) have no page count, so the 80-page cap can't bound them.
# This char cap is the D18 time-budget analog: ~300K chars ≈ ~75K tokens ≈ a few
# embedding batches, keeping worst-case ingest well under the 300s function cap.
MAX_TEXT_CHARS = 300_000
# Chunk rows are inserted in batches (each row carries a 768-d vector).
CHUNK_INSERT_BATCH = 100

ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}
# Extensions accepted (mirror of the allowlist, used for sanity checks).
ALLOWED_EXTENSIONS = {"pdf", "txt", "md", "docx"}

# --- Retrieval (D7, D10) --------------------------------------------------
RETRIEVAL_MATCH_COUNT = 8               # fused top-K passed to the LLM
# (the RRF constant k=60 lives in supabase/hybrid_search.sql, its single user)
SNIPPET_CHARS = 320                     # source-snippet length shown in the UI

# Embedding backoff schedule (retries on 429/quota).
EMBED_MAX_RETRIES = 5
EMBED_BASE_DELAY_SECONDS = 0.5

# Highlight needle bounds (per-sentence search_for, D11).
HIGHLIGHT_MIN_NEEDLE = 8                 # skip needles too short to be distinctive
HIGHLIGHT_MAX_NEEDLE = 180               # search_for degrades on very long needles

# SIM_FLOOR was calibrated empirically against the bundled test corpus (D10;
# see docs/decisions.md "SIM_FLOOR calibration"): in-domain best-cosines
# measured 0.630-0.718, truly off-topic 0.498-0.559, so 0.60 sits in the gap.
# Topically-adjacent-but-unanswered questions score above any floor; those are
# caught by the prompt-level refusal (gate b). Re-check with
# scripts/calibrate_floor.py (run the API with SIM_FLOOR=0). Override via env.
SIM_FLOOR = float(_optional("SIM_FLOOR", "0.60"))
# Answers whose best similarity only barely clears the floor carry a visible
# "weak match" caveat in the UI (D10).
WEAK_MATCH_MARGIN = float(_optional("WEAK_MATCH_MARGIN", "0.03"))

# --- Chat history (D13) ---------------------------------------------------
MAX_HISTORY_TURNS = 6                   # last N turns sent to generation only

# --- URL data source (D12) ------------------------------------------------
MAX_LINKED_DOC_CANDIDATES = 10          # cap same-domain linked docs offered
URL_FETCH_TIMEOUT_SECONDS = 20
URL_MAX_DOWNLOAD_BYTES = MAX_FILE_BYTES
URL_MAX_REDIRECT_HOPS = 5               # SSRF guard re-checks each hop

# --- Generation tuning ----------------------------------------------------
GENERATION_TEMPERATURE = 0.2
GENERATION_MAX_OUTPUT_TOKENS = 1024
# Flash models "think" silently by default, adding seconds before the first
# token. Grounded RAG answers don't need it — 0 disables (big latency win).
GENERATION_THINKING_BUDGET = int(_optional("GENERATION_THINKING_BUDGET", "0"))
# Hard cap on any single Gemini HTTP call — a bad route must fail fast and
# surface as an error, never hang the stream.
GENAI_HTTP_TIMEOUT_SECONDS = int(_optional("GENAI_HTTP_TIMEOUT_SECONDS", "45"))

# --- CORS / misc ----------------------------------------------------------
# Single Vercel project ⇒ same origin; permissive default is fine for local dev.
ALLOWED_ORIGINS = _optional("ALLOWED_ORIGINS", "*").split(",")
