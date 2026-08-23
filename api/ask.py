"""Ask pipeline (Phase 2): retrieve -> gate -> generate -> validate citations.

Yields SSE frames in the contract order: ``sources`` -> ``delta``* ->
``citations`` -> ``done`` (or ``error``). Retrieval always precedes generation,
so ``sources`` is always first. The "not in the docs" gate (D10) short-circuits
with a canned message and makes no LLM call. Cited ``[n]`` markers are validated
against the retrieved set server-side (D9); anything not retrieved is dropped.
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence

import prompts
import sse
from errors import AppError
from models import ChatTurn, Citation
from retrieval import retrieve

_CITATION_RE = re.compile(r"\[(\d+)\]")


def _validate_citations(answer: str, sources: list) -> list[Citation]:
    """Map the ``[n]`` markers actually present in the answer to their sources.

    Only markers whose ``n`` indexes a retrieved source survive (D9). Order is
    first-appearance in the answer; duplicates collapse.
    """
    by_n = {s.n: s for s in sources}
    seen: set[int] = set()
    citations: list[Citation] = []
    for match in _CITATION_RE.finditer(answer):
        n = int(match.group(1))
        if n in by_n and n not in seen:
            seen.add(n)
            s = by_n[n]
            citations.append(
                Citation(
                    n=s.n,
                    chunk_id=s.chunk_id,
                    document_id=s.document_id,
                    filename=s.filename,
                    page=s.page,
                    section=s.section,
                )
            )
    return citations


def stream_ask(question: str, history: Sequence[ChatTurn]) -> Iterator[str]:
    """Generate the SSE frame sequence for one question."""
    try:
        result = retrieve(question)
    except AppError as err:
        yield sse.error_event(err.code, err.message)
        return
    except Exception:  # noqa: BLE001 - never leak internals into the stream
        yield sse.error_event("retrieval_failed", "Retrieval failed.")
        return

    # `sources` is always the first event (retrieval precedes generation).
    yield sse.sources_event(result.sources, result.weak_match, result.not_found)

    if result.not_found:
        # Gate (a): no LLM call — stream the canned message and finish.
        yield sse.delta_event(prompts.NOT_FOUND_MESSAGE)
        yield sse.done_event()
        return

    context_block = prompts.build_context_block(result.context_passages)

    answer_parts: list[str] = []
    try:
        # Lazy import keeps the SDK off the import path for tests.
        from gemini import stream_answer

        for delta in stream_answer(question, context_block, history):
            answer_parts.append(delta)
            yield sse.delta_event(delta)
    except AppError as err:
        yield sse.error_event(err.code, err.message)
        return
    except Exception:  # noqa: BLE001
        yield sse.error_event("generation_failed", "Answer generation failed.")
        return

    citations = _validate_citations("".join(answer_parts), result.sources)
    yield sse.citations_event(citations)
    yield sse.done_event()
