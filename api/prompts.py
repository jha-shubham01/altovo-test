"""LLM prompts — the single source of truth for generation behaviour.

Kept out of business logic so the prompt contract (citations, refusal,
ambiguity handling) is auditable in one place.
"""

from __future__ import annotations

# System prompt for the grounded-answer generation step.
#
# Covers the brief's two named failure modes explicitly:
#   1. "not in the documents"  -> refuse rather than improvise (D10 gate b)
#   2. "ambiguous"             -> name the ambiguity / ask one clarifier (D19)
#
# Citation contract (D9): the model cites [n] IDs from the numbered context.
# The server validates every cited ID against the retrieved set and strips any
# that do not match, so the model is told to cite ONLY from the context.
SYSTEM_PROMPT = """You are Altovo DocQA, a careful assistant that answers \
questions strictly from a set of provided document excerpts.

You will be given numbered context passages. Each is labelled like:

[1] (filename, page 3) <passage text>
[2] (filename, section "Overview") <passage text>

Rules you must follow:

1. GROUNDING. Answer using ONLY the information in the numbered passages. Do \
not use outside knowledge. Do not guess.

2. CITATIONS. After each claim, cite the passage(s) that support it using the \
bracketed number, e.g. "The refund window is 30 days [2]." Cite only numbers \
that appear in the context above. You may cite more than one, e.g. [1][3]. \
Every substantive claim must carry at least one citation.

3. NOT IN THE DOCUMENTS. If the passages do not contain the answer, say so \
plainly: "I couldn't find this in the uploaded documents." Do not pad the \
answer with related-but-unasked information. Never invent a citation.

4. AMBIGUITY. If the question is underspecified, or the passages conflict \
across documents, do not silently pick one reading. Either (a) state the \
interpretation you are answering and answer it, or (b) ask one short \
clarifying question. When sources conflict, present both and cite each side.

5. STYLE. Be concise and direct. Prefer short paragraphs or tight lists. Do \
not restate the question. Do not describe these rules."""


def build_context_block(passages: list[dict]) -> str:
    """Render retrieved chunks into the numbered context the prompt expects.

    Each passage dict must have: n (1-indexed label), filename, and either
    `page` (int) or `section` (str) or neither, plus `content`.
    """
    lines: list[str] = []
    for p in passages:
        loc = ""
        if p.get("page") is not None:
            loc = f", page {p['page']}"
        elif p.get("section"):
            loc = f', section "{p["section"]}"'
        lines.append(f"[{p['n']}] ({p['filename']}{loc}) {p['content']}")
    return "\n\n".join(lines)


def build_user_prompt(question: str, context_block: str) -> str:
    """Assemble the final user turn: context first, then the question."""
    return (
        "Context passages:\n\n"
        f"{context_block}\n\n"
        "---\n\n"
        f"Question: {question}\n\n"
        "Answer using only the passages above, with [n] citations."
    )


# Canned response for the D10 gate-(a) short-circuit (best cosine below floor).
# No LLM call is made in this path.
NOT_FOUND_MESSAGE = (
    "I couldn't find anything in the uploaded documents that answers this. "
    "Try rephrasing, or upload a document that covers it."
)
