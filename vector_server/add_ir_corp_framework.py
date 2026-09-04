"""Author + ingest original IR Ethics & Corporate Governance Framework (GS4 Paper-IV topics)."""
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

OUT = "/app/data/ethics/ethics/IR_Corporate_Governance_Frameworks.pdf"

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], fontSize=15, spaceAfter=6)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12.5, spaceBefore=10, spaceAfter=4, textColor=colors.HexColor("#1a3a5c"))
body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9.5, leading=13, alignment=TA_JUSTIFY, spaceAfter=5)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=14, bulletIndent=4, spaceAfter=3)
cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=8.5, leading=11)

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=15*mm, bottomMargin=15*mm,
                        title="International-Relations Ethics & Corporate Governance Frameworks")

story = []
story.append(Paragraph("General Studies Paper-IV (Ethics): Ethical Issues in International Relations & Corporate Governance", H1))
story.append(Spacer(1, 4))
story.append(Paragraph("An original, first-party conceptual reference authored for this study corpus. It reproduces no "
    "copyrighted text; it distils standard, widely-known ethical frameworks (foreign-aid ethics, climate equity, soft "
    "power, and CSR/ESG governance) into structured study notes. Verify specific statutory figures against primary "
    "sources (Companies Act 2013, Companies (CSR Policy) Rules) when quoting exact numbers in an answer.", body))
story.append(PageBreak())

# ---- PART A: International Relations & Funding ---- 
story.append(Paragraph("PART A - Ethical Issues in International Relations & Funding", H1))
story.append(Paragraph("International relations is not value-neutral: state behaviour is judged against human dignity, "
    "distributive justice, sovereignty, and responsibility. GS4 questions test whether the candidate can weigh "
    "national interest against global ethical obligations.", body))

story.append(Paragraph("A.1 Two lenses on international ethics", H2))
for t in [
    "Realist lens: states act on national interest; morality is subordinate to survival and power. Ethical critique: this absolves complicity in harm and ignores the weak.",
    "Cosmopolitan/liberal lens: individuals have moral standing independent of nationality; duties of assistance and justice extend across borders (e.g. aid, climate, human rights).",
]:
    story.append(Paragraph("&bull; " + t, bullet))
story.append(Paragraph("A defensible GS4 answer typically acknowledges both, then argues that while national interest is "
    "legitimate, it must be exercised with integrity, consistency, and regard for global public goods.", body))

story.append(Paragraph("A.2 Foreign aid & development funding", H2))
for t in [
    "Principle of need: aid should prioritise those in greatest need, not only strategic allies.",
    "Principle of effectiveness: results-based, accountable, non-tied aid respects recipient ownership.",
    "Tied vs untied aid: tying aid to donor goods/services is often self-interested; untied aid is more defensible ethically.",
    "Avoiding moral hazard: aid should not reward corruption but also must not abandon the vulnerable to governance failures.",
    "India's model: needs-based, concessional Line of Credit (LOC) and development partnership without intrusive conditionality is broadly consistent with respect for sovereignty.",
]:
    story.append(Paragraph("&bull; " + t, bullet))

story.append(Paragraph("A.3 Climate equity (common but differentiated responsibilities)", H2))
story.append(Paragraph("The UNFCCC principle of Common but Differentiated Responsibilities and Respective Capabilities "
    "(CBDR-RC) is the ethical backbone of climate negotiations. It holds that countries that historically emitted "
    "most and have greatest capacity must bear a greater share of mitigation and finance obligations, while "
    "developing countries need 'climate justice' - equitable access to the remaining carbon budget and support "
    "(Green Climate Fund, technology transfer, adaptation finance).", body))
story.append(Paragraph("Key ethical tests to apply: Who benefited from past emissions? Who is most vulnerable to climate "
    "harm? What is the fair distribution of the burden and of adaptation finance?", body))

story.append(Paragraph("A.4 Soft power & public diplomacy ethics", H2))
for t in [
    "Soft power: attracting rather than coercing - culture, values, institutions, and diaspora influence.",
    "Ethical soft power rests on consistency between a state's declared values and its actual conduct (credibility).",
    "It should inform and persuade, not deceive; propaganda that misleads erodes long-term trust.",
    "India's soft power: pluralism, democracy, yoga/ayurveda, IT diaspora, development partnerships, and principled non-alignment in a multipolar world.",
]:
    story.append(Paragraph("&bull; " + t, bullet))

story.append(Paragraph("A.5 Sanctions, intervention, and funding integrity", H2))
story.append(Paragraph("Ethical uses of international leverage must be proportionate, lawful, and aimed at protecting "
    "civilians rather than punishing populations. Financial integrity in foreign funding also matters: sovereign "
    "funds, FDI, and aid must respect anti-money-laundering norms, avoid corrupt sources, and not become channels "
    "for undue political influence.", body))
story.append(PageBreak())

# ---- PART B: Corporate Governance ----
story.append(Paragraph("PART B - Ethics in Corporate Governance", H1))
story.append(Paragraph("Corporate governance is the framework of rules, practices, and processes by which a company is "
    "directed and controlled. It exists to align the interests of management, board, shareholders, and the wider "
    "society (stakeholders).", body))

story.append(Paragraph("B.1 Core principles of good corporate governance", H2))
for i, t in enumerate([
    "Transparency: timely, accurate disclosure of financial and material information.",
    "Accountability: clearly defined roles of board, management, and auditors, answerable to shareholders.",
    "Fairness: equitable treatment of all shareholders, including minority and non-promoter investors.",
    "Responsibility: recognition of duties toward all stakeholders - employees, customers, community, environment.",
    "Integrity: ethical conduct and conflict-of-interest management throughout the organisation.",
],1):
    story.append(Paragraph(f"{i}. {t}", bullet))

story.append(Paragraph("B.2 Companies Act, 2013 - CSR provisions", H2))
story.append(Paragraph("Section 135 of the Companies Act, 2013 (read with the Companies (CSR Policy) Rules) mandates "
    "that eligible companies - those with a specified net worth, turnover, or net profit threshold - spend at "
    "least a prescribed percentage of average net profits on Corporate Social Responsibility activities. Key "
    "mechanisms:", body))
for t in [
    "A CSR Committee of the board formulates the CSR policy, recommends activities, and monitors expenditure.",
    "Eligible activities are listed in Schedule VII (poverty, education, health, environment, gender equality, etc.).",
    "Unspent amounts for ongoing projects are transferred to an 'Unspent CSR Account'; non-compliance attracts penalties.",
    "The law converts CSR from voluntary charity into a statutory obligation - a shift from philanthropy to mandated social responsibility with accountability and audit.",
]:
    story.append(Paragraph("&bull; " + t, bullet))
story.append(Paragraph("Ethical note for GS4: CSR is not a substitute for lawful profit-making or tax compliance; it "
    "complements a company's duty to operate responsibly. Window-dressing CSR (spending without impact, inflating "
    "compliance) is itself an ethical failure.", body))

story.append(Paragraph("B.3 ESG (Environmental, Social, Governance) framework", H2))
story.append(Paragraph("ESG is the investor-facing extension of responsible business: it rates a company on "
    "Environmental impact (climate risk, waste, resource use), Social performance (labour, human rights, community, "
    "consumer safety), and Governance quality (board independence, ethics, anti-corruption, disclosure).", body))
story.append(Paragraph("India has mandated Business Responsibility and Sustainability Reporting (BRSR) disclosures for "
    "large listed companies via SEBI, aligning Indian corporate disclosure with global ESG norms. ESG integrates "
    "non-financial risk into capital allocation and institutional stewardship.", body))
for t in [
    "Greenwashing: overstating environmental/social performance without substance - a key ethical risk to flag.",
    "Ethical investing/stewardship: investors using ESG data to push responsible conduct rather than purely maximise short-term return.",
    "Governance as the anchor: weak board independence and weak audit corrupt both Environmental and Social claims.",
]:
    story.append(Paragraph("&bull; " + t, bullet))

story.append(Paragraph("B.4 Whistle-blowing, audit integrity, and anti-corruption", H2))
for t in [
    "Vigil mechanism: the Companies Act requires a whistle-blower mechanism that protects directors/employees reporting genuine concerns.",
    "Audit integrity: independent statutory and internal audit, rotation of auditors, and audit committees reduce collusion.",
    "Prevention of Corruption Act, 1988 and the Lokpal/Lokayuktas framework deter bribery of public servants by companies.",
    "Beneficial-ownership transparency and anti-money-laundering norms deny corrupt funds a compliant corporate shell.",
]:
    story.append(Paragraph("&bull; " + t, bullet))
story.append(Paragraph("Concluding synthesis: in IR, ethics demands consistency between values and conduct, distributive "
    "justice toward the vulnerable, and integrity in funding. In the corporate sphere, ethics demands transparency, "
    "accountability to all stakeholders, mandated but genuine CSR, and robust governance/audit. Both domains converge "
    "on the same core: public trust is the ultimate currency, and it is earned only through accountable, principled "
    "conduct.", body))

doc.build(story)
print("PDF written:", OUT, os.path.getsize(OUT), "bytes")

fh = sha256_hex(OUT)
name = "IR_Corporate_Governance_Frameworks.pdf"
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
