"""Author + ingest original GS4 Case-Study Solving Framework (first-party methodology doc)."""
import os, sys, hashlib
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store, ingest_hybrid

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

OUT = "/app/data/ethics/ethics/GS4_CaseStudy_Solving_Framework.pdf"

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=16, spaceAfter=6)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#1a3a5c"))
body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9.5, leading=13, alignment=TA_JUSTIFY, spaceAfter=5)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=14, bulletIndent=4, spaceAfter=3)
cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=8.5, leading=11)

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=15*mm, bottomMargin=15*mm,
                        title="GS4 Case-Study Solving Framework")

story = []
story.append(Paragraph("General Studies Paper-IV (Ethics) — Administrative Case-Study Solving Framework", H1))
story.append(Spacer(1, 4))
story.append(Paragraph("An original, first-party methodology reference authored for this study corpus. "
    "It does not reproduce any copyrighted text; it distils standard public-domain administrative-ethics reasoning "
    "into a reusable problem-solving structure. Use as a structural template when the RAG encounters dilemma-based "
    "case studies that ask for an ethical course of action.", body))
story.append(PageBreak())

# Section 1
story.append(Paragraph("1. The UPSC GS4 Case-Study Format", H2))
story.append(Paragraph("GS4 Paper-II typically presents a 250-word situational vignette with an embedded ethical dilemma "
    "and asks 3-4 questions such as: identify the ethical issues involved; list the options available with their merits "
    "and demerits; what is the most ethical course of action and why; what are the long-term and the immediate "
    "measures. Answer these in structured prose with sub-headings, never as a narrative essay alone. The examiner "
    "rewards: (a) correct identification of stakeholders, (b) a clear value-conflict statement, (c) a defensible decision "
    "rule, (d) actionable short- and long-term measures, and (e) consistency with constitutional values, civil-service "
    "codes, and statutory mechanisms.", body))

story.append(Paragraph("1.1 Anatomy of the answer", H2))
for t in [
    "Opening: one line stating the core dilemma as a tension between competing values (e.g. rule-of-law vs compassion; confidentiality vs public interest; hierarchy vs professional integrity).",
    "Issue identification: enumerate the ethical dimensions (integrity, transparency, accountability, equity, conflict of interest, misuse of discretion, public trust).",
    "Stakeholder analysis: map who is affected and each party's legitimate interests.",
    "Option evaluation: list realistically available courses of action with merits and demerits.",
    "Decision with justification: state the chosen action and the ethical principle(s) and statutory basis that support it.",
    "Immediate versus long-term measures: concrete steps to implement the decision and to prevent recurrence.",
    "Conclusion: tie back to public-interest and institutional integrity.",
]:
    story.append(Paragraph("&bull; " + t, bullet))

story.append(PageBreak())

# Section 2
story.append(Paragraph("2. Stakeholder Analysis Matrix", H2))
story.append(Paragraph("Before choosing an action, identify every stakeholder and their stake, interest, and likely "
    "position. Use this matrix structure; the RAG should reproduce rows for the actors in the specific vignette.", body))

stake_rows = [
    ["Stakeholder", "Legitimate Interest / Claim", "Power / Influence", "Ethical Obligation owed to them", "Likely stance"],
    ["Citizen / Beneficiary", "Fair, timely, non-discriminatory service", "Low-Moderate (electoral/voice)", "Public interest, rights, dignity", "Most vulnerable; safeguard first"],
    ["Subordinate staff", "Fair workload, lawful orders, protection of due process", "Moderate (operational)", "Respect, no coercion into wrongdoing", "May fear consequences; mentor"],
    ["Superiors / Political executive", "Policy coherence, loyalty, discipline", "High (authority)", "Candour + obedience within law", "Expect compliance; wary of disclosure"],
    ["Peers / Colleagues", "Non-interference, fairness, integrity", "Moderate", "Honesty, no collusion", "Watchful; may be complicit"],
    ["Vendors / Contractors", "Transparent procurement, no favouritism", "Moderate (corruption risk)", "Integrity in procurement, GFR compliance", "Seek undue advantage if unchecked"],
    ["General public / Press", "Accountability, transparency, information", "High (media/oversight)", "Truthfulness, RTI, no cover-up", "Demand disclosure; hold to account"],
    ["Self (the officer)", "Career, conscience, professional integrity", "Personal agency", "Self-respect, honesty, courage", "Must act as ethical anchor"],
]
tdata = [[Paragraph(c, cell) for c in row] for row in stake_rows]
t = Table(tdata, colWidths=[30*mm, 44*mm, 26*mm, 36*mm, 36*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1a3a5c")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#eef3f8")]),
]))
story.append(t)
story.append(Spacer(1, 6))
story.append(Paragraph("Reading the matrix: identify which stakeholder's claim is strongest in the given facts, then "
    "weigh the competing claims against the constitutional value of equality and the civil-service duty of public "
    "interest. The matrix prevents a one-sided answer that protects only the officer or only the complainant.", body))

story.append(PageBreak())

# Section 3
story.append(Paragraph("3. Immediate versus Long-Term Actions", H2))
story.append(Paragraph("Every case-study answer must distinguish the steps to stop the harm now from the systemic "
    "reforms that prevent recurrence. Use the following two-column structure.", body))

imm_rows = [
    ["Immediate (0 - 30 days) — Curb & Contain", "Long-Term — Reform & Prevent"],
    ["1. Stop the harm: suspend the irregular practice, halt the corrupt transaction, protect the vulnerable party.", "1. Institutionalise: codify procedures, standard operating procedures, checklists, and delegation norms."],
    ["2. Follow due procedure: document the facts, protect evidence, obtain lawful/competent authority sanction.", "2. Build systems: e-governance, single-window, digitised workflows to reduce discretionary human touchpoints."],
    ["3. Communicate: transparently inform affected stakeholders; escalate facts to the appropriate authority.", "3. Audit & oversight: strengthen internal audit, concurrent audit, CAG audits, and Ombudsman/Lokpal recourse."],
    ["4. No cover-up: uphold RTI and transparency; do not destroy or hide records.", "4. Capacity-building: ethics training, conduct-rule sensitisation, induction and refresher programmes."],
    ["5. Provisional consequence: put the impugned action on hold / issue show-cause per Conduct Rules, respecting natural justice.", "5. Incentives: recognise integrity, whistle-blower protection, and deterrent sanctions for proven misconduct."],
    ["6. Legal safeguard: invoke applicable statutory mechanisms (Prevention of Corruption Act, GFR, audit requisitions, CVC reference) where relevant.", "6. Feedback loop: post-implementation review, grievance redressal, and citizen charters with measurable service standards."],
]
td = [[Paragraph(c, cell) for c in row] for row in imm_rows]
t2 = Table(td, colWidths=[82*mm, 82*mm])
t2.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (0,0), colors.HexColor("#1a3a5c")),
    ("BACKGROUND", (1,0), (1,0), colors.HexColor("#2e5f8a")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#eef3f8")]),
]))
story.append(t2)
story.append(Spacer(1, 6))
story.append(Paragraph("Rule of thumb: immediate measures must respect natural justice and the rule of law; long-term "
    "measures must be systemic, not ad hoc. An answer that lists only punitive steps without reform is incomplete, as "
    "is one that is all reform with no immediate containment.", body))

story.append(PageBreak())

# Section 4
story.append(Paragraph("4. Conflict-of-Interest (CoI) Resolution Framework", H2))
story.append(Paragraph("Many GS4 vignettes plant a private interest against public duty (a relative in the vendor list, a "
    "gift, a shareholding, a past association). Resolve using the four-step RECO test.", body))
for t in [
    "Recognise: detect the CoI early; be alert to gifts, hospitality, family/associate links, and duplicated roles.",
    "Enumerate the duties: separate the private interest from the public duty; name the values at stake (impartiality, objectivity, integrity).",
    "Cut the conflict, not just concede it: the safest course is recusal (disqualification from the decision); alternatively declare the interest to the competent authority in writing and obtain a formal direction.",
    "Observe the record: document the declaration, the recusal, and the reason; transparency converts a latent conflict into a managed, defensible one.",
]:
    story.append(Paragraph("&bull; " + t, bullet))
story.append(Paragraph("Guiding legal/policy anchors that the RAG may cite: the Civil Services (Conduct) Rules (Rules 3-5 "
    "on maintaining integrity and avoiding conflicts of interest), the Prevention of Corruption Act, 1988 (Section 7 "
    "dealing with obtainment by public servant), and the 2nd ARC Report on Ethics in Governance. When in doubt, the "
    "ethical default is public interest and full transparency over private convenience.", body))

story.append(Paragraph("4.1 Decision rule hierarchy", H2))
for i, t in enumerate([
    "Public interest > private interest (always, but reconciled lawfully).",
    "Rule of law > personal discretion (order a lawful action; refuse an unlawful one and record reasons).",
    "Transparency / accountability > secrecy (except lawful confidentiality on security or privacy grounds).",
    "Equity > expediency (protect the vulnerable and the voiceless).",
    "Long-term institutional integrity > short-term convenience.",
], 1):
    story.append(Paragraph(f"{i}. {t}", bullet))

story.append(PageBreak())

# Section 5
story.append(Paragraph("5. Word-Budget Template (150-250 word limit, e.g. 150 words)", H2))
tmpl_rows = [
    ["Component", "Approx. words", "What to include"],
    ["Dilemma statement", "15", "One line naming the value-conflict"],
    ["Ethical issues", "25", "3-4 issues as comma-separated values"],
    ["Stakeholders", "15", "Key actors and their stakes (brief)"],
    ["Options (2-3) + merits/demerits", "45", "Each option in a sentence or two"],
    ["Chosen action + rationale", "25", "Decision + principle + brief statutory anchor"],
    ["Immediate + long-term measures", "20", "One each, concrete and specific"],
    ["Conclusion", "5", "Tie to public interest"],
]
td = [[Paragraph(c, cell) for c in row] for row in tmpl_rows]
t3 = Table(td, colWidths=[50*mm, 34*mm, 80*mm])
t3.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1a3a5c")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#eef3f8")]),
]))
story.append(t3)
story.append(Spacer(1, 6))
story.append(Paragraph("5.1 Common pitfalls to avoid", H2))
for t in [
    "Moralising without a concrete decision (state a clear action, not just principles).",
    "Ignoring the non-dilemma facts that constrain options (budget, law, hierarchy).",
    "Exonerating every actor; be fair but do not under-state culpability where facts show it.",
    "Proposing impossible 'political' solutions; stay within the officer's lawful discretion.",
    "Omitting the implementation phase (immediate + long-term is non-negotiable).",
]:
    story.append(Paragraph("&bull; " + t, bullet))
story.append(Paragraph("Final guidance: GS4 rewards balanced, constitutional, implementation-minded reasoning. Always "
    "end with the interests of the citizen and the integrity of the institution intact.", body))

doc.build(story)
print("PDF written:", OUT, os.path.getsize(OUT), "bytes")

fh = sha256_hex(OUT)
name = "GS4_CaseStudy_Solving_Framework.pdf"
rel = "ethics/" + name
r2key = "gs4/ethics/" + name
r2_store.upload_r2_object(r2key, OUT)
conn = ingest_hybrid.get_conn()
with conn.cursor() as cur:
    cur.execute("INSERT INTO documents (file_hash,file_name,subject_id,status) VALUES (%s,%s,%s,'indexed') "
                "ON CONFLICT (file_hash) DO UPDATE SET file_name=EXCLUDED.file_name,subject_id=EXCLUDED.subject_id,"
                "status='indexed',error_message=NULL,updated_at=NOW()", (fh, rel, "ethics"))
conn.commit()
ingest_hybrid.release_conn(conn)
print("OK", rel, "r2="+r2key)
