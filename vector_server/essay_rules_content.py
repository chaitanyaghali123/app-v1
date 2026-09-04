# essay_rules_content.py
# ==========================================================
# CURATED ESSAY STRUCTURING RULES — the "how to write" layer.
#
# UPSC awards marks for coherence, structure, multi-dimensionality
# and balanced argument rather than raw facts. These framework
# entries are injected as retrievable knowledge (content_type =
# FRAMEWORK) so the drafting prompt always has access to the
# structural contract before it composes.
#
# Entry shape consumed by essay_kb.upsert_entry:
#   content_type=FRAMEWORK, theme, title, content_text, tags
# ==========================================================

RULES = [
    {
        "theme": "Framework",
        "title": "Essay word-count allocation",
        "content_text": (
            "Allocate the essay length as follows: Introduction 100-150 words (open "
            "with a hook — a quote, anecdote or paradox, and state the thesis); "
            "Core body 800-900 words (draft through PESTLE plus philosophical "
            "analysis, with a clear antithesis in the mid-body); Conclusion 100-150 "
            "words (forward-looking, optimistic, anchored in a constitutional "
            "vision). This allocation keeps the essay balanced and within the "
            "expected length."
        ),
        "source_origin": "ESSAY_FRAMEWORK",
        "tags": ["structure", "word-count", "introduction", "conclusion"],
    },
    {
        "theme": "Framework",
        "title": "Required multi-dimensional perspectives",
        "content_text": (
            "Cover every relevant perspective to score on multi-dimensionality: "
            "Philosophical/Ethical; Historical/Classical; Socio-Cultural & Gender; "
            "Political & Administrative; Economic & Environmental; Technological & "
            "Future Impact. Frame each dimension explicitly (e.g. 'Politically, ...') "
            "so the examiner sees the breadth of treatment."
        ),
        "source_origin": "ESSAY_FRAMEWORK",
        "tags": ["perspectives", "multidimensional", "pestle", "dimensions"],
    },
    {
        "theme": "Framework",
        "title": "Mandatory structural elements",
        "content_text": (
            "Include a clear thesis statement in the introduction; an antithesis / "
            "counter-argument in the mid-body; a synthesis / balanced resolution "
            "before the conclusion; and transition words connecting every adjacent "
            "paragraph. A strong essay argues both sides before resolving on a "
            "nuanced, constitutional-values based position."
        ),
        "source_origin": "ESSAY_FRAMEWORK",
        "tags": ["thesis", "antithesis", "synthesis", "transitions", "structure"],
    },
    {
        "theme": "Framework",
        "title": "Hook bank — quotes, anecdotes, paradoxes",
        "content_text": (
            "Open with one of: a public-domain quote (from the QUOTE layer), a short "
            "historical anecdote (from the ANECDOTE layer), or a paradoxical "
            "statement. The hook must connect to the thesis within two sentences. "
            "Avoid beginning with 'In today's world' or dictionary definitions, which "
            "read as cliches."
        ),
        "source_origin": "ESSAY_FRAMEWORK",
        "tags": ["hook", "introduction", "quotes", "anecdote"],
    },
    {
        "theme": "Framework",
        "title": "Evidence & example integration",
        "content_text": (
            "Support every claim with real-world evidence: a numbered scheme or "
            "programme, a statute, a case study (DARPG best-practices), or a "
            "historical event. Use the EVIDENCE layer for administrative examples and "
            "the SOCIO-ECONOMIC layer for policy data. Tie each example back to the "
            "thesis rather than listing facts."
        ),
        "source_origin": "ESSAY_FRAMEWORK",
        "tags": ["evidence", "examples", "schemes", "case-studies"],
    },
    {
        "theme": "Framework",
        "title": "Conclusion — constitutional vision",
        "content_text": (
            "Conclude with a forward-looking and hopeful tone anchored in the "
            "Constitution's values — dignity, justice, fraternity and equality. "
            "Restate the thesis in new words, synthesise the main threads, and end on "
            "a single memorable line. Avoid introducing new arguments in the "
            "conclusion."
        ),
        "source_origin": "ESSAY_FRAMEWORK",
        "tags": ["conclusion", "constitutional-values", "vision", "synthesis"],
    },
]


ALL_RULES = RULES
