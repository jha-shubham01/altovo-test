"""Retrieval + the "not in the docs" gate (D7, D10).

Embeds the question (``RETRIEVAL_QUERY``), runs the hybrid_search RPC (pgvector
cosine + FTS fused with RRF), then applies the similarity floor: if the best raw
cosine is below ``SIM_FLOOR`` the caller must short-circuit with the canned
"couldn't find it" response and make **no** LLM call. A best score that only
barely clears the floor is flagged ``weak_match`` for the UI caveat.
"""

from __future__ import annotations

from dataclasses import dataclass

import config
import db
from embedding import embed_query
from models import RetrievedSource


@dataclass
class RetrievalResult:
    sources: list[RetrievedSource]        # UI shape (truncated snippet)
    context_passages: list[dict]          # full content for the LLM prompt
    weak_match: bool
    not_found: bool


def _snippet(content: str) -> str:
    text = " ".join(content.split())
    if len(text) <= config.SNIPPET_CHARS:
        return text
    return text[:config.SNIPPET_CHARS].rsplit(" ", 1)[0] + "…"


def _filename_lookup(document_ids: set[str]) -> dict[str, str]:
    """Resolve document_id -> filename for the retrieved chunks in one query."""
    return {
        row["id"]: row.get("filename", "document")
        for row in db.get_documents_by_ids(list(document_ids))
    }


def retrieve(question: str) -> RetrievalResult:
    """Retrieve the top passages for a question and apply the floor gate."""
    query_vec = embed_query(question)
    rows = db.rpc_hybrid_search(query_vec, question, config.RETRIEVAL_MATCH_COUNT)

    if not rows:
        return RetrievalResult(sources=[], context_passages=[], weak_match=False, not_found=True)

    best_similarity = max(float(r.get("similarity") or 0.0) for r in rows)
    if best_similarity < config.SIM_FLOOR:
        # Gate (a): below the floor — the caller must not call the LLM.
        return RetrievalResult(sources=[], context_passages=[], weak_match=False, not_found=True)

    filenames = _filename_lookup({str(r["document_id"]) for r in rows})

    sources: list[RetrievedSource] = []
    context_passages: list[dict] = []
    for n, row in enumerate(rows, start=1):
        doc_id = str(row["document_id"])
        filename = filenames.get(doc_id, "document")
        context_passages.append(
            {
                "n": n,
                "filename": filename,
                "page": row.get("page"),
                "section": row.get("section"),
                "content": row.get("content", ""),
            }
        )
        sources.append(
            RetrievedSource(
                n=n,
                chunk_id=int(row["id"]),
                document_id=doc_id,
                filename=filename,
                page=row.get("page"),
                section=row.get("section"),
                snippet=_snippet(row.get("content", "")),
                similarity=float(row.get("similarity") or 0.0),
                rrf_score=float(row.get("rrf_score") or 0.0),
            )
        )

    weak_match = best_similarity < (config.SIM_FLOOR + config.WEAK_MATCH_MARGIN)
    return RetrievalResult(
        sources=sources,
        context_passages=context_passages,
        weak_match=weak_match,
        not_found=False,
    )
