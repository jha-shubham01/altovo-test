"""Unit tests for the hand-rolled chunker (D8).

The load-bearing invariant is that a chunk's recorded char span slices exactly
back to its content within the segment text — that is what makes the highlight
lookup honest (D11).
"""

import config
from chunking import Segment, chunk_segment, chunk_segments, estimate_tokens


def _para(words: int, marker: str) -> str:
    return " ".join(f"{marker}{i}" for i in range(words))


def test_span_roundtrip_within_segment():
    text = "\n\n".join(_para(120, f"p{p}_") for p in range(6))
    seg = Segment(text=text, page=1, section=None)
    chunks = chunk_segment(seg, start_index=0)
    assert chunks, "expected at least one chunk"
    for c in chunks:
        assert text[c.char_start : c.char_end] == c.content


def test_pages_never_merged():
    segs = [
        Segment(text=_para(200, "a_"), page=1),
        Segment(text=_para(200, "b_"), page=2),
    ]
    chunks = chunk_segments(segs)
    for c in chunks:
        markers = {tok.split("_")[0] for tok in c.content.split()}
        # Every chunk's tokens come from exactly one page's marker family.
        assert markers <= {"a"} or markers <= {"b"}
    assert {c.page for c in chunks} == {1, 2}


def test_target_size_respected():
    text = "\n\n".join(_para(80, f"s{p}_") for p in range(20))
    chunks = chunk_segment(Segment(text=text, page=1), start_index=0)
    # No chunk should greatly exceed the target (single oversized units aside).
    for c in chunks:
        assert c.token_count <= config.CHUNK_TARGET_TOKENS * 1.6


def test_overlap_present_between_consecutive_chunks():
    text = "\n\n".join(_para(100, f"o{p}_") for p in range(8))
    chunks = chunk_segment(Segment(text=text, page=1), start_index=0)
    if len(chunks) < 2:
        return
    # Consecutive chunk spans should overlap (end of one >= start of next).
    for a, b in zip(chunks, chunks[1:], strict=False):
        assert b.char_start < a.char_end


def test_monotonic_index_across_segments():
    segs = [Segment(text=_para(300, f"m{p}_"), page=p + 1) for p in range(3)]
    chunks = chunk_segments(segs)
    indices = [c.chunk_index for c in chunks]
    assert indices == list(range(len(chunks)))


def test_empty_and_whitespace_segments():
    assert chunk_segment(Segment(text="", page=1), 0) == []
    assert chunk_segment(Segment(text="   \n\n  ", page=1), 0) == []


def test_tiny_input_single_chunk():
    seg = Segment(text="Refund window is 30 days.", page=1)
    chunks = chunk_segment(seg, 0)
    assert len(chunks) == 1
    assert chunks[0].content == "Refund window is 30 days."
    assert chunks[0].token_count == estimate_tokens(seg.text)


def test_oversized_single_sentence_is_split():
    # One sentence far larger than target must still be broken into word-packed
    # chunks, and each must round-trip.
    giant = " ".join(f"w{i}" for i in range(4000))  # no sentence punctuation
    seg = Segment(text=giant, page=1)
    chunks = chunk_segment(seg, 0)
    assert len(chunks) > 1
    for c in chunks:
        assert giant[c.char_start : c.char_end] == c.content
        assert c.token_count <= config.CHUNK_TARGET_TOKENS * 1.6
