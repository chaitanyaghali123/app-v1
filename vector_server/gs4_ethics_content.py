# gs4_ethics_content.py
# ==========================================================
# CURATED GS4 CONTENT — all entries are original concise
# encyclopedic summaries of public facts/ideas, or short
# official-policy identification lines from Government of
# India publications (2nd ARC / CVC manual), which are in
# the public domain. No private/commercial coaching material.
# ==========================================================

import logging

from gs4_ethics_kb import upsert_entry

logger = logging.getLogger(__name__)


# ==========================================================
# 1) DEFINITIONS & THEORY  (Section A foundation)
# ==========================================================

DEFINITIONS = [
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "DEFINITION",
        "title": "Ethics — Nature and Meaning",
        "content_text": (
            "Ethics is the branch of philosophy that studies what is morally right and wrong, "
            "good and bad, and prescribes standards of right conduct. In the GS4 syllabus, ethics "
            "covers the moral principles that should govern a civil servant's conduct, decision "
            "making and attitude towards citizens. The 2nd Administrative Reforms Commission "
            "(ARC) defined ethics in governance as the application of moral values to the conduct "
            "of public officials, emphasising that ethics is not merely legal compliance but "
            "rests on a personal sense of duty and conscience. Ethics differs from law: law is "
            "codified, enforceable and the minimum standard society allows, while ethics sets the "
            "higher standard of what ought to be done even when no one is watching."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_2ND_ARC",
        "source_url": "https://darpg.gov.in/sites/default/files/ethics4.pdf",
        "tags": ["ethics", "morality", "values", "right conduct"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "DEFINITION",
        "title": "Morality and Character",
        "content_text": (
            "Morality refers to a system of socially or personally held principles that guide "
            "individual behaviour and judgement about right and wrong. Character is the set of "
            "habitual moral traits of a person — integrity, honesty, courage, compassion and "
            "self-discipline — that make good behaviour reliable over time. Aristotle held that "
            "character (ethos) is formed through habitual action: 'we are what we repeatedly do'. "
            "For a civil servant, a good character matters because discretionary powers and "
            "non-codified situations cannot be governed by rules alone; they require dependable "
            "inner moral dispositions."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_ARISTOTLE",
        "tags": ["morality", "character", "virtue", "habit", "discretion"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "DEFINITION",
        "title": "Integrity — Meaning and Importance",
        "content_text": (
            "Integrity means consistency between one's words, values and actions, and adhering to "
            "moral and professional principles even under pressure or temptation. The 2nd ARC "
            "identifies integrity as the cornerstone of public service ethics: an officer of "
            "integrity is incorruptible, transparent about conflicts of interest, and refuses "
            "undue influence. Integrity also implies intellectual honesty — welcoming scrutiny, "
            "admitting mistakes and refusing to manipulate facts. In governance, institutional "
            "integrity requires codes of ethics, conflict-of-interest rules, whistleblower "
            "protection and accountability mechanisms such as the Central Vigilance Commission."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_2ND_ARC",
        "source_url": "https://darpg.gov.in/sites/default/files/ethics4.pdf",
        "tags": ["integrity", "probity", "public service", "corruption"],
    },
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "DEFINITION",
        "title": "Probity in Public Life",
        "content_text": (
            "Probity means absolute honesty, uprightness and adherence of public officials to "
            "ethical standards beyond mere legality. The Nolan Committee principles of public life "
            "(selflessness, integrity, objectivity, accountability, openness, honesty, leadership) "
            "are widely used to describe probity. In India, probity in governance requires "
            "transparency of decisions and assets, code of conduct for ministers and civil "
            "servants, prevention of conflict of interest, and vigilance over corruption. The 2nd "
            "ARC recommended a Code of Ethics for civil servants, separate from the disciplinary "
            "Code of Conduct, to articulate aspirational standards of probity."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_2ND_ARC_NOLAN",
        "tags": ["probity", "transparency", "accountability", "public life"],
    },
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "DEFINITION",
        "title": "Transparency, Accountability and Contestability",
        "content_text": (
            "Transparency means openness in government processes — decisions, data, procurement "
            "and performance should be visible and justifiable to citizens, operationalised in "
            "India through the Right to Information Act 2005. Accountability means officials must "
            "answer for the use of public power and resources, through parliamentary, judicial and "
            "citizen oversight. Contestability means citizens should be able to question, "
            "challenge and influence government decisions (e.g., public hearings, PILs, grievance "
            "redressal). Together these three values convert abstract integrity into enforceable "
            "governance norms and reduce the space for arbitrariness and corruption."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_OECD_GOV",
        "tags": ["transparency", "accountability", "contestability", "RTI"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "DEFINITION",
        "title": "Empathy, Compassion and Tolerance",
        "content_text": (
            "Empathy is the capacity to understand and share the feelings of another person, "
            "essential for citizen-centric administration. Compassion is empathy translated into "
            "action — an active desire to relieve suffering, central to welfare and justice "
            "delivery. Tolerance is respect for people whose beliefs, customs and identities "
            "differ from one's own; in a plural society like India it is the foundation of "
            "social harmony and equal treatment. Together these 'soft' values shape bureaucratic "
            "attitude, making administration humane, just and responsive to the vulnerable."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS",
        "tags": ["empathy", "compassion", "tolerance", "attitude"],
    },
    {
        "syllabus_tag": "GS4_EI",
        "module_category": "DEFINITION",
        "title": "Emotional Intelligence — Concept (Goleman)",
        "content_text": (
            "Emotional Intelligence (EI) is the ability to perceive, understand, regulate and use "
            "one's own and others' emotions constructively. Daniel Goleman popularised a model "
            "with four domains: (1) self-awareness — knowing your emotions and their effects; "
            "(2) self-management — regulating impulses, staying composed under pressure; "
            "(3) social awareness — empathy and reading organisational dynamics; and "
            "(4) relationship management — persuasion, conflict management and teamwork. For "
            "public servants EI underpins measured decision making, ethical judgement under "
            "workplace stress, and effective people-centred governance."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_GOLEMAN_NCERT",
        "tags": ["emotional intelligence", "EQ", "self awareness", "management"],
    },
    {
        "syllabus_tag": "GS4_ATTITUDE",
        "module_category": "DEFINITION",
        "title": "Attitude — Nature, Components and Formation",
        "content_text": (
            "An attitude is a learned tendency to evaluate a person, idea, object or group "
            "favourably or unfavourably. The ABC model describes three components: Affective "
            "(feelings/emotions), Behavioural (inclination to act), and Cognitive (beliefs and "
            "thoughts). Attitudes are learnt through (i) association and reinforcement, "
            "(ii) reward and punishment, (iii) modelling and observation, and (iv) information "
            "and media exposure. Family, school, reference groups and culture shape attitudes. "
            "Cognitive consistency theories (Festinger's cognitive dissonance) explain attitude "
            "change: people adjust beliefs or behaviour to reduce psychological discomfort."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_NCERT_PSYCHOLOGY",
        "source_url": "https://ncert.nic.in/textbook/pdf/lepy106.pdf",
        "tags": ["attitude", "ABC model", "formation", "cognitive dissonance"],
    },
    {
        "syllabus_tag": "GS4_ATTITUDE",
        "module_category": "DEFINITION",
        "title": "Attitude Change and Persuasion",
        "content_text": (
            "Attitude change occurs through persuasion along the source-message-channel-receiver "
            "framework. Factors influencing change include attributes of the communicator "
            "(credibility, attractiveness), the message (rational vs emotional appeal, "
            "two-sided arguments), and the receiver (involvement, persuasibility). Balance theory "
            "and cognitive dissonance describe the mental drive toward consistency. Prejudice is "
            "a rigid, emotionally charged attitude usually based on false generalisations "
            "(stereotypes); discrimination is prejudiced action. Strategies to handle prejudice "
            "include intergroup contact, education, superordinate goals and promoting "
            "perspective-taking — directly relevant to a civil servant managing diversity."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_NCERT_PSYCHOLOGY",
        "source_url": "https://ncert.nic.in/textbook/pdf/lepy106.pdf",
        "tags": ["attitude change", "persuasion", "prejudice", "stereotype"],
    },
    {
        "syllabus_tag": "GS4_EI",
        "module_category": "DEFINITION",
        "title": "Motivation — Types and Maslow's Hierarchy",
        "content_text": (
            "Motivation is the process of energising, directing and sustaining goal-directed "
            "behaviour. Biological motives (hunger, thirst, sleep, sex) and social/psychological "
            "motives (achievement, power, affiliation, curiosity) drive human action. Maslow's "
            "hierarchy orders needs from physiological, safety, belongingness, esteem to "
            "self-actualisation, arranged on the premise that 'lower' needs must be substantially "
            "satisfied before higher ones motivate. In administration, motivation theories are "
            "used to understand both citizen compliance and employee performance, and to build "
            "organisations that reward ethical and efficient conduct."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_NCERT_PSYCHOLOGY",
        "source_url": "https://ncert.nic.in/textbook/pdf/kepy108.pdf",
        "tags": ["motivation", "maslow", "achievement", "need hierarchy"],
    },
    {
        "syllabus_tag": "GS4_ATTITUDE",
        "module_category": "DEFINITION",
        "title": "Social Cognition — Attribution and Stereotypes",
        "content_text": (
            "Social cognition is how people perceive, interpret and make sense of the social "
            "world. Key mechanisms are schemas (organised mental frameworks), heuristics, "
            "stereotypes (oversimplified beliefs about a group) and attribution (assigning causes "
            "to behaviour — internal vs external, stable vs unstable). Fundamental attribution "
            "error is the tendency to over-attribute others' behaviour to their character and "
            "underweight situation. Self-fulfilling prophecy shows how false expectations can "
            "produce real behaviour. Understanding these biases helps public officials avoid "
            "discriminatory decisions, nepotism and errors in judging citizens and colleagues."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_NCERT_PSYCHOLOGY",
        "source_url": "https://ncert.nic.in/textbook/pdf/lepy106.pdf",
        "tags": ["social cognition", "attribution", "schema", "stereotype"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "DEFINITION",
        "title": "Values and Ethics — Distinction",
        "content_text": (
            "Values are broad, enduring beliefs about what is desirable and worth striving for "
            "(e.g., equality, liberty, service, compassion); they guide attitude and behaviour "
            "across situations. Ethics is the systematic study and application of moral "
            "principles. The distinction matters for GS4: values are the deep motivational "
            "substrate, while ethical reasoning translates values into defensible decisions. "
            "Constitutional values (justice, liberty, equality, fraternity), Gandhian values "
            "(truth, non-violence, trusteeship) and bureaucratic values (neutrality, "
            "impartiality, professionalism) supply the value base for Indian civil servants."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS",
        "tags": ["values", "ethics", "distinction", "constitutional values"],
    },
]


# ==========================================================
# 2) THINKERS (public-domain ideas, original summaries)
# ==========================================================

THINKERS = [
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Socrates",
        "content_text": (
            "Socrates (c. 470–399 BCE) founded Western moral philosophy. His core method was the "
            "Socratic dialogue: relentless questioning to expose vague or inconsistent beliefs and "
            "lead interlocutors to self-knowledge. His central thesis was that virtue (arete) is "
            "knowledge — people do wrong only through ignorance of the true good. He taught that "
            "the unexamined life is not worth living, that one should 'know thyself', and that "
            "it is better to suffer injustice than to commit it. His trial and voluntary death "
            "by hemlock rather than abandon his principles make him the model of principled "
            "integrity under coercion."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["socrates", "virtue is knowledge", "dialogue", "integrity"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Plato",
        "content_text": (
            "Plato (c. 428–348 BCE), student of Socrates, argued through the Republic that "
            "justice in the individual mirrors justice in the state, and that society should be "
            "led by philosopher-kings who understand the Form of the Good. He held that rulers "
            "must be educated to wisdom and virtue, and famously proposed that those who hold "
            "power should be the least desirous of it, taking office as a compulsory duty. This "
            "idea — that leadership should be service, not privilege — remains a touchstone for "
            "arguments about integrity, meritocracy and the proper education of public servants."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["plato", "justice", "philosopher king", "rule of the wise"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Aristotle — Virtue Ethics",
        "content_text": (
            "Aristotle (384–322 BCE) built the Western tradition of virtue ethics. He held that "
            "the good life (eudaimonia, flourishing) is realised by cultivating moral virtues — "
            "stable traits between extremes (the Golden Mean), e.g., courage is the mean between "
            "cowardice and recklessness. Virtue is acquired by habituation: 'we become just by "
            "doing just acts'. He distinguished intellectual virtues (teachable wisdom, prudence) "
            "from moral virtues (character), and stressed practical wisdom (phronesis) for judging "
            "what is right in particular situations — essential for discretionary public "
            "decision making."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["aristotle", "virtue ethics", "golden mean", "phronesis"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Immanuel Kant — Deontology",
        "content_text": (
            "Immanuel Kant (1724–1804) built deontological (duty-based) ethics. His Categorical "
            "Imperative states: act only according to that maxim which you can at the same time "
            "will as a universal law; and treat humanity, in yourself and others, always as an "
            "end and never merely as a means. Morality, for Kant, resides in acting from duty, "
            "not from inclination or expected consequences. His stress on universalisability and "
            "respect for persons grounds arguments for human dignity, rule of law, equal "
            "treatment and the prohibition of exploitative conduct — core to impartial public "
            "administration."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["kant", "deontology", "categorical imperative", "duty"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "John Stuart Mill — Utilitarianism",
        "content_text": (
            "John Stuart Mill (1806–1873) refined Bentham's utilitarianism: the rightness of an "
            "action is judged by its consequences — the greatest happiness of the greatest "
            "number. Mill insisted on the qualitative distinction of pleasures ('better to be a "
            "Socrates dissatisfied than a fool satisfied') and wedded utilitarianism to "
            "individual liberty, defending free speech and self-development (On Liberty) while "
            "limiting harm through a 'harm principle'. His consequentialist weighing of harms "
            "and benefits informs policy ethics and cost-benefit reasoning in public "
            "administration."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["mill", "utilitarianism", "greatest good", "liberty"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Mahatma Gandhi — Seven Social Sins and Trusteeship",
        "content_text": (
            "M.K. Gandhi's ethics rest on truth (satya) and non-violence (ahimsa). His list of "
            "Seven Social Sins — politics without principle, wealth without work, commerce "
            "without morality, pleasure without conscience, education without character, science "
            "without humanity, and worship without sacrifice — is a concise ethical audit for "
            "public life found in his Young India writings. His doctrine of trusteeship held that "
            "wealth is held in trust for society, and that ends never justify corrupt means. "
            "Gandhi wanted politics to be a means of moral service, making his ideas central to "
            "UPSC essays and integrity questions."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["gandhi", "seven social sins", "trusteeship", "satya", "ahimsa"],
    },
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "THINKER",
        "title": "Kautilya — Ethics of Statecraft (Arthashastra)",
        "content_text": (
            "Kautilya (Chanakya), in the Arthashastra (c. 4th century BCE), wrote on "
            "administration, corruption and the duties of the king and his officers. He insisted "
            "that 'just as it is impossible not to taste honey placed on the tongue, so it is "
            "impossible for an official to remain incorruptible while handling public money' — an "
            "early recognition of systemic corruption. Accordingly he prescribed rigorous "
            "surveillance of officials, rotation of postings, severe punishments for "
            "misappropriation, and a hierarchy of duties placing the welfare of the subjects "
            "(rajapraja) at the centre. Modern anti-corruption administration echoes his "
            "preventive-control logic."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["kautilya", "arthashastra", "corruption", "statecraft"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Buddha — Eightfold Path and Ethics",
        "content_text": (
            "Gautama Buddha taught a ethics of discipline and right intention, systematised in "
            "the Noble Eightfold Path: right view, right resolve, right speech, right conduct, "
            "right livelihood, right effort, right mindfulness and right concentration — the "
            "first five being fundamentally ethical. The principles stress truthful speech, "
            "abstention from stealing and harming life, and mindfulness of one's own mind. "
            "Buddhist ethics emphasises compassion (karuna), loving-kindness (metta) and the "
            "law of karma (moral causation), offering a non-theistic framework for personal "
            "moral self-cultivation relevant to attitude and integrity development."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["buddha", "eightfold path", "right conduct", "karma"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "THINKER",
        "title": "Swami Vivekananda — Character and Service",
        "content_text": (
            "Swami Vivekananda taught that character is the sum of one's habitual thoughts and "
            "actions, and that education's end is the building of character ('Education is the "
            "manifestation of the perfection already in man'). He called for 'renunciation and "
            "service' — selfless work for others as the highest morality — and linked it to "
            "national reconstruction ('they alone live who live for others'). His emphasis on "
            "self-confidence, fearlessness, and duty without attachment provides a strong "
            "framework for a civil servant's inner discipline and public-spiritedness."
        ),
        "source_origin": "ORIGINAL_SYNTHESIS_PUBLIC_DOMAIN",
        "tags": ["vivekananda", "character", "service", "self confidence"],
    },
]


# ==========================================================
# 3) ADMINISTRATIVE ETHICS — GOVT OF INDIA (public domain)
# ==========================================================

ADMIN_ETHICS = [
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "REPORT_2ND_ARC",
        "title": "2nd ARC — Ethics in Governance (4th Report) Overview",
        "content_text": (
            "The 2nd Administrative Reforms Commission's 4th Report 'Ethics in Governance' (2007) "
            "is the foundational government document on bureaucratic integrity. It recommends: "
            "(i) a Code of Ethics for civil servants complementing the existing disciplinary Code "
            "of Conduct; (ii) publication of a citizen's charter of standards; (iii) transparency "
            "through proactive disclosure; (iv) a Lokpal and Lokayukta with statutory powers; "
            "(v) ratification of the UN Convention against Corruption; (vi) a legal framework for "
            "whistleblower protection; (vii) rules on post-retirement employment of officials; "
            "and (viii) electoral reforms to cleanse funding of politics. The report anchors "
            "formal ethics institutions in the values of integrity, objectivity and neutrality."
        ),
        "source_origin": "2ND_ARC_4TH_REPORT",
        "source_url": "https://darpg.gov.in/sites/default/files/ethics4.pdf",
        "tags": ["ARC", "ethics in governance", "lokpal", "code of ethics"],
    },
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "REPORT_2ND_ARC",
        "title": "Central Vigilance Commission (CVC) — Anti-Corruption Mechanism",
        "content_text": (
            "The Central Vigilance Commission, a statutory body established by the CVC Act 2003, "
            "is the apex vigilance institution for corruption prevention in Indian government "
            "departments. Its key instruments are the Vigilance Manual, integrity pacts in "
            "public procurement, complaint handling and forensic audit of scams. The CVC "
            "promotes integrity through preventive (systems), preventive-punitive (investigation "
            "of complaints) and punitive vigilance (discipline). Its guidelines encourage "
            "whistleblower protection and transparency safeguards."
        ),
        "source_origin": "CVC_MANUAL_GOVT_INDIA",
        "source_url": "https://cvc.gov.in",
        "tags": ["CVC", "vigilance", "anti-corruption", "integrity pact"],
    },
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "REPORT_2ND_ARC",
        "title": "Right to Information Act 2005 — Transparency Framework",
        "content_text": (
            "The RTI Act 2005 operationalises transparency by giving citizens a statutory right "
            "to request and receive information from public authorities, with proactive "
            "disclosure under Section 4. The 2nd ARC's 1st Report (RTI, 2006) called RTI the "
            "'master key' to good governance because transparency prevents arbitrariness, checks "
            "corruption and empowers citizens. It recommended digitisation of records, "
            "publication of pro-active disclosures, and reasonable fee structures. RTI links the "
            "citizen, the official and the institution in a chain of accountability that "
            "underpins ethical administration."
        ),
        "source_origin": "2ND_ARC_1ST_REPORT",
        "source_url": "https://darpg.gov.in/sites/default/files/rti_masterkey.pdf",
        "tags": ["RTI", "transparency", "right to information", "accountability"],
    },
]


# ==========================================================
# 4) CASE-SCENARIO TEMPLATES (ethical decision frameworks,
#    modelled on public UPSC paper-4 style; original wording)
# ==========================================================

CASE_SCENARIOS = [
    {
        "syllabus_tag": "GS4_PROBITY",
        "module_category": "CASE_EXAMPLE",
        "title": "Case — Conflict of Interest in Tender Award",
        "content_text": (
            "Scenario: A young officer managing public procurement discovers a senior's relative "
            "owns one of the bidding firms which is likely to win a large tender. Approach: "
            "(i) disclose the conflict of interest immediately and in writing to higher "
            "authorities; (ii) recuse yourself from the evaluation committee; (iii) recommend "
            "rebidding or independent scrutiny ensuring level-playing field; (iv) document all "
            "steps to protect transparency. Governing values: objectivity, impartiality, "
            "probity and the principle that public interest overrides private relationships."
        ),
        "source_origin": "ORIGINAL_SCENARIO_GOVT_ETHICS",
        "tags": ["case", "conflict of interest", "tender", "probity"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "CASE_EXAMPLE",
        "title": "Case — Whistleblowing an Act of Malpractice",
        "content_text": (
            "Scenario: A clerk discovers that a file critical to a welfare scheme has been "
            "deliberately delayed to extract bribes. Approach: (i) collect documentary evidence "
            "lawfully; (ii) report through official channels, first internally, then to vigilance "
            "as the Whistle Blowers Protection Act route; (iii) avoid leaking to media before "
            "internal remedies are exhausted; (iv) continue duty without vengefulness. Values: "
            "integrity, courage, loyalty to the public interest over peer loyalty, and "
            "responsible dissent within the law."
        ),
        "source_origin": "ORIGINAL_SCENARIO_GOVT_ETHICS",
        "tags": ["case", "whistleblowing", "corruption", "integrity"],
    },
    {
        "syllabus_tag": "GS4_EI",
        "module_category": "CASE_EXAMPLE",
        "title": "Case — Managing an Angry Citizen (Emotional Intelligence)",
        "content_text": (
            "Scenario: A citizen, emotional and shouting, complains at a service counter about a "
            "stalled application. Approach: use emotional-regulation skills — (i) stay calm and "
            "do not take the anger personally (self-management); (ii) listen actively and validate "
            "the grievance (empathy); (iii) separate the person from the problem and state the "
            "concrete next step (social awareness + relationship management); (iv) escalate "
            "genuinely to fix the systemic cause if valid. This is emotional intelligence applied "
            "to citizen-centric administration: composure under stress preserves both dignity and "
            "effectiveness."
        ),
        "source_origin": "ORIGINAL_SCENARIO_GOVT_ETHICS",
        "tags": ["case", "emotional intelligence", "grievance", "citizen"],
    },
    {
        "syllabus_tag": "GS4_ATTITUDE",
        "module_category": "CASE_EXAMPLE",
        "title": "Case — Handling Prejudice in a Public Office",
        "content_text": (
            "Scenario: An officer notices colleagues informally treating applicants from a "
            "particular region or caste with bias, delaying their files. Approach: (i) recognise "
            "the stereotype and refuse to share the bias (self-awareness); (ii) ensure objective "
            "criteria and first-come-first-serve processing so discrimination is structurally "
            "impossible; (iii) model impartial conduct and gently confront biased remarks; "
            "(iv) train the team on anti-discrimination. This case applies attitude and "
            "prejudice theory: behaviour change (procedural fairness) can reshape attitudes, and "
            "a leader's example shapes the group's social cognition."
        ),
        "source_origin": "ORIGINAL_SCENARIO_GOVT_ETHICS",
        "tags": ["case", "prejudice", "stereotype", "impartiality"],
    },
    {
        "syllabus_tag": "GS4_VALUES",
        "module_category": "CASE_EXAMPLE",
        "title": "Case — Pressure from Politicians on a Transfer Decision",
        "content_text": (
            "Scenario: A politician pressures an officer to transfer an official who is "
            "investigating irregularities in his constituency. Approach: (i) decline politely and "
            "in writing, citing the principles of rule of law and non-arbitrary transfer norms; "
            "(ii) keep the investigation moving within the law; (iii) inform higher authorities "
            "proactively of the pressure so the record is clear; (iv) focus on the public "
            "interest outcome rather than personal safety. Governing values: courage of "
            "conviction, neutrality, resistance to undue influence, and integrity under pressure."
        ),
        "source_origin": "ORIGINAL_SCENARIO_GOVT_ETHICS",
        "tags": ["case", "pressure", "neutrality", "integrity"],
    },
]


ALL_CONTENT = DEFINITIONS + THINKERS + ADMIN_ETHICS + CASE_SCENARIOS

TAG_TO_LABEL = {
    "GS4_VALUES": "Ethics & Human Interface",
    "GS4_ATTITUDE": "Attitude",
    "GS4_EI": "Emotional Intelligence",
    "GS4_PROBITY": "Probity in Governance",
}


def seed_all(embed=True):
    ensure_done = 0
    for entry in ALL_CONTENT:
        try:
            upsert_entry(
                module_category=entry["module_category"],
                syllabus_tag=entry["syllabus_tag"],
                title=entry["title"],
                content_text=entry["content_text"],
                source_origin=entry.get("source_origin", "ORIGINAL_SYNTHESIS"),
                source_url=entry.get("source_url"),
                tags=entry.get("tags", []),
                embed=embed,
            )
            ensure_done += 1
        except Exception as exc:
            logger.warning(f"seed failed for {entry['title']}: {exc}")
    return ensure_done


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from gs4_ethics_kb import ensure_table, kb_stats

    ensure_table()
    n = seed_all(embed=False)
    print(f"Seeded {n}/{len(ALL_CONTENT)} entries")
    print(kb_stats())