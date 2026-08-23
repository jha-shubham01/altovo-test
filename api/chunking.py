"""Hand-rolled recursive chunker (D8).

Splits parsed segments into ~``CHUNK_TARGET_TOKENS`` chunks with a small
overlap, recursing paragraph -> sentence -> word only as far as needed to keep
any single unit under target. It is **page/section-aware**: chunking runs within
one segment at a time, so a chunk never spans two PDF pages.

Every chunk records ``char_start``/``char_end`` as offsets into its segment's
text, and the invariant ``segment_text[char_start:char_end] == content`` holds
exactly (enables the highlight-by-lookup path, D11). This module is pure — no
network, no SDK — so it is fully unit-testable.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

import config

# Sentence boundary: end punctuation followed by whitespace. Deliberately
# simple — good enough for chunk sizing, and the char spans stay honest either
# way because we only ever slice the original text.
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")
_PARAGRAPH_BOUNDARY = re.compile(r"\n\s*\n")
_WHITESPACE = re.compile(r"\S+")


@dataclass(frozen=True)
class Segment:
    """A contiguous parsed unit with its location metadata.

    ``text`` is the segment's own text; char offsets in produced chunks are
    relative to this string. PDFs yield one segment per page (``page`` set,
    ``section`` None); docx/txt/md yield one per heading block (``section`` set,
    ``page`` None).
    """

    text: str
    page: int | None = None
    section: str | None = None


@dataclass(frozen=True)
class Chunk:
    chunk_index: int
    page: int | None
    section: str | None
    char_start: int
    char_end: int
    content: str
    token_count: int


def estimate_tokens(text: str) -> int:
    """Cheap character-based token estimate (D18 arithmetic uses this)."""
    return max(1, math.ceil(len(text) / config.CHARS_PER_TOKEN))


def _span_tokens(start: int, end: int) -> int:
    """Token estimate for a char range, without materialising the slice."""
    return max(1, math.ceil((end - start) / config.CHARS_PER_TOKEN))


@dataclass(frozen=True)
class _Span:
    """An atomic offset range within a segment's text."""

    start: int
    end: int

    @property
    def length(self) -> int:
        return self.end - self.start


def _spans_by_regex(text: str, start: int, end: int, pattern: re.Pattern[str]) -> list[_Span]:
    """Split ``text[start:end]`` on ``pattern``, returning non-empty spans."""
    spans: list[_Span] = []
    cursor = start
    for m in pattern.finditer(text, start, end):
        if m.start() > cursor:
            spans.append(_Span(cursor, m.start()))
        cursor = m.end()
    if cursor < end:
        spans.append(_Span(cursor, end))
    return spans


def _word_spans(text: str, start: int, end: int) -> list[_Span]:
    return [_Span(m.start(), m.end()) for m in _WHITESPACE.finditer(text, start, end)]


def _atomic_units(text: str, target_tokens: int) -> list[_Span]:
    """Break the text into units none of which exceeds ``target_tokens``.

    Recurse only as far as needed: paragraphs, then oversized paragraphs into
    sentences, then oversized sentences into words. Whitespace between units is
    left out of the unit spans but is recovered when a chunk is sliced, because
    a chunk's content is ``text[first.start:last.end]``.
    """

    def token_len(span: _Span) -> int:
        return estimate_tokens(text[span.start : span.end])

    units: list[_Span] = []
    paragraphs = _spans_by_regex(text, 0, len(text), _PARAGRAPH_BOUNDARY)
    for para in paragraphs:
        if token_len(para) <= target_tokens:
            units.append(para)
            continue
        sentences = _spans_by_regex(text, para.start, para.end, _SENTENCE_BOUNDARY)
        for sent in sentences:
            if token_len(sent) <= target_tokens:
                units.append(sent)
                continue
            # Oversized sentence: drop to word granularity. Words stay atomic
            # (never pre-packed) so the packer sizes chunks and overlap cleanly
            # even when a "sentence" has no punctuation to break on.
            units.extend(_word_spans(text, sent.start, sent.end))
    return [u for u in units if u.length > 0]


def _pack(text: str, units: list[_Span], target_tokens: int) -> list[_Span]:
    """Greedily group consecutive units into non-overlapping chunk spans."""
    if not units:
        return []

    chunks: list[_Span] = []
    start: int | None = None
    end = 0
    for unit in units:
        if start is None:
            start, end = unit.start, unit.end
            continue
        if _span_tokens(start, unit.end) > target_tokens:
            chunks.append(_Span(start, end))
            start, end = unit.start, unit.end
        else:
            end = unit.end
    if start is not None:
        chunks.append(_Span(start, end))
    return chunks


def _apply_overlap(text: str, spans: list[_Span], overlap_tokens: int) -> list[_Span]:
    """Extend each chunk (except the first) leftward by ~overlap_tokens.

    Overlap is applied at the character level, snapped forward to a word
    boundary so a chunk never starts mid-token. Spans still slice back to their
    content exactly (they are plain offset ranges), so the highlight invariant
    holds.
    """
    if overlap_tokens <= 0 or len(spans) < 2:
        return spans
    overlap_chars = overlap_tokens * config.CHARS_PER_TOKEN
    out: list[_Span] = [spans[0]]
    for span in spans[1:]:
        back = max(0, span.start - overlap_chars)
        if back > 0:
            # Snap to the start of the first whole word at/after `back`.
            ws = text.rfind(" ", back, span.start)
            if ws != -1:
                back = ws + 1
        out.append(_Span(back, span.end))
    return out


def chunk_segment(
    segment: Segment,
    start_index: int,
    target_tokens: int | None = None,
    overlap_tokens: int | None = None,
) -> list[Chunk]:
    """Chunk a single segment; ``start_index`` is the running global index."""
    target = target_tokens or config.CHUNK_TARGET_TOKENS
    overlap = overlap_tokens if overlap_tokens is not None else config.CHUNK_OVERLAP_TOKENS
    text = segment.text
    if not text.strip():
        return []

    units = _atomic_units(text, target)
    spans = _apply_overlap(text, _pack(text, units, target), overlap)

    chunks: list[Chunk] = []
    for i, span in enumerate(spans):
        content = text[span.start : span.end]
        if not content.strip():
            continue
        chunks.append(
            Chunk(
                chunk_index=start_index + i,
                page=segment.page,
                section=segment.section,
                char_start=span.start,
                char_end=span.end,
                content=content,
                token_count=estimate_tokens(content),
            )
        )
    return chunks


def chunk_segments(segments: list[Segment]) -> list[Chunk]:
    """Chunk every segment in order, assigning a monotonic ``chunk_index``."""
    out: list[Chunk] = []
    for segment in segments:
        produced = chunk_segment(segment, start_index=len(out))
        out.extend(produced)
    return out
