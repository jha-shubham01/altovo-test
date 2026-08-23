"""Gemini embeddings via ``google-genai``.

Asymmetric task types (D5): ``RETRIEVAL_DOCUMENT`` at ingest,
``RETRIEVAL_QUERY`` at ask. Output is 768-dim Matryoshka-truncated and is
**not** pre-normalized, so every vector is L2-renormalized here. Requests are
batched (``EMBED_BATCH_SIZE``) and retried with exponential backoff on 429.
"""

from __future__ import annotations

import math
import time

import config
from errors import AppError
from genai_client import get_genai_client

# Backoff schedule for rate-limit / transient errors.


def _is_retryable(err: Exception) -> bool:
    """True for rate-limit / transient server errors worth backing off on."""
    code = getattr(err, "code", None)
    status = str(getattr(err, "status", "") or "")
    return code in (429, 503, 500) or "RESOURCE_EXHAUSTED" in status


def _l2_normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0.0:
        return vector
    return [v / norm for v in vector]


def _embed_batch(texts: list[str], task_type: str) -> list[list[float]]:
    # Imported lazily so the package imports without the SDK installed/keyed.
    from google.genai import errors as genai_errors
    from google.genai import types

    client = get_genai_client()
    cfg = types.EmbedContentConfig(
        task_type=task_type,
        output_dimensionality=config.EMBEDDING_DIMS,
    )

    delay = config.EMBED_BASE_DELAY_SECONDS
    last_err: Exception | None = None
    for attempt in range(config.EMBED_MAX_RETRIES):
        try:
            # SDK surface live-verified (see docs/decisions.md, live bring-up:
            # measured 0.7-0.9s per embed batch after the IPv4 transport pin).
            resp = client.models.embed_content(
                model=config.EMBEDDING_MODEL,
                contents=texts,
                config=cfg,
            )
            return [_l2_normalize(list(e.values)) for e in resp.embeddings]
        except genai_errors.APIError as err:
            last_err = err
            if _is_retryable(err) and attempt < config.EMBED_MAX_RETRIES - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise AppError(
                "embedding_failed",
                f"Embedding request failed: {err.message}",
                502,
            ) from err
    raise AppError(
        "embedding_failed",
        "Embedding request exhausted retries.",
        502,
    ) from last_err


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed ingest passages (``RETRIEVAL_DOCUMENT``), in config-sized batches."""
    out: list[list[float]] = []
    for start in range(0, len(texts), config.EMBED_BATCH_SIZE):
        batch = texts[start : start + config.EMBED_BATCH_SIZE]
        out.extend(_embed_batch(batch, "RETRIEVAL_DOCUMENT"))
    return out


def embed_query(text: str) -> list[float]:
    """Embed a single user question (``RETRIEVAL_QUERY``)."""
    return _embed_batch([text], "RETRIEVAL_QUERY")[0]
