# essay_anecdotes_content.py
# ==========================================================
# CURATED HISTORICAL ANECDOTES — short encyclopedic summaries
# of iconic events used to open an essay, transition a body
# paragraph, or close with impact. All entries are concise
# factual summaries of public-domain historical events (facts
# are not copyrightable) with a justified "lesson"/application.
#
# Entry shape consumed by essay_kb.upsert_entry:
#   content_type=ANECDOTE, theme, title, content_text,
#   source_origin, source_url, tags
# ==========================================================

ANECDOTES = [
    {
        "theme": "Environment",
        "title": "The Chipko Movement (1973)",
        "content_text": (
            "In 1973 villagers of the Garhwal Himalaya resisted the felling of trees "
            "by physically hugging them, giving birth to the Chipko Movement. Led "
            "largely by women such as Gaura Devi, it became a global symbol of "
            "non-violent, community-led environmental resistance. Its lesson is that "
            "ecology is not separate from livelihood but is the very basis of survival."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "source_url": "https://darpg.gov.in/",
        "tags": ["environment", "non-violence", "community", "forests"],
    },
    {
        "theme": "Freedom",
        "title": "The Salt March (1930)",
        "content_text": (
            "In 1930 Gandhi walked 240 miles from Sabarmati to Dandi to break the "
            "salt law, defying a colonial monopoly with a pinch of salt. The march "
            "recast ordinary civil disobedience as the moral core of the freedom "
            "struggle and drew global attention. Its lesson is that symbolic acts, "
            "when multiplied by moral clarity, can move mountains."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["freedom", "non-violence", "civil disobedience", "gandhi"],
    },
    {
        "theme": "Leadership",
        "title": "The Dandi — leadership by example",
        "content_text": (
            "Over 80,000 Indians were arrested during the salt satyagraha of 1930, "
            "yet the movement remained remarkably non-violent. Leaders did not merely "
            "command from the front; they marched, marched, and were jailed alongside "
            "the masses. Its lesson is that authority is earned through shared "
            "suffering, not decreed."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["leadership", "sacrifice", "non-violence", "mass movement"],
    },
    {
        "theme": "Knowledge",
        "title": "The Renaissance (14th-16th century)",
        "content_text": (
            "Between the 14th and 16th centuries Europe shifted its centre of gravity "
            "from dogmatic acceptance to human inquiry, reviving classical learning "
            "and celebrating individual reason. Figures like Leonardo and Galileo "
            "embodied curiosity unbound by orthodoxy. Its lesson is that civilisational "
            "progress is a function of freeing the inquiring mind."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["knowledge", "renaissance", "reason", "inquiry"],
    },
    {
        "theme": "Governance",
        "title": "The Enlightenment (18th century)",
        "content_text": (
            "The 18th-century Enlightenment elevated reason, rights and the social "
            "contract against divine right and hereditary privilege. Thinkers like "
            "Locke, Rousseau and Kant supplied the philosophical scaffolding for "
            "constitutions and representative government. Its lesson is that ideas, "
            "not armies, ultimately reshape political orders."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["governance", "enlightenment", "rights", "reason"],
    },
    {
        "theme": "Climate",
        "title": "Bhopal Gas Tragedy (1984)",
        "content_text": (
            "The 1984 methyl isocyanate leak in Bhopal killed thousands overnight and "
            "exposed the human cost of industrial negligence and weak regulation. It "
            "became a watershed for environmental law and corporate accountability "
            "worldwide. Its lesson is that safety and sustainability cannot be "
            "outsourced to the bottom line."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["climate", "industrial", "governance", "safety"],
    },
    {
        "theme": "Justice",
        "title": "The Salt of the Earth — Ambedkar and constitutional equality",
        "content_text": (
            "Dr. B. R. Ambedkar, born into a Dalit family across the caste divide, "
            "became the chief architect of the Indian Constitution. His insistence on "
            "fundamental rights, reservations and 'one person, one vote' gave the "
            "world's largest democracy its moral keel. Its lesson is that justice is "
            "not given but engineered through institutions."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["justice", "constitution", "equality", "ambedkar"],
    },
    {
        "theme": "Digital",
        "title": "India Stack and financial inclusion",
        "content_text": (
            "The building of Aadhaar, UPI and the public digital infrastructure — "
            "collectively India Stack — connected over a billion Indians to identity "
            "and payments in little over a decade. It transformed financial inclusion "
            "from a slogan into a daily reality for the poor. Its lesson is that "
            "shared public digital rails can leapfrog development hurdles."
        ),
        "source_origin": "OFFICIAL_POLICY",
        "source_url": "https://www.niti.gov.in/",
        "tags": ["digital", "inclusion", "technology", "governance"],
    },
    {
        "theme": "Education",
        "title": "Nalanda and the idea of a university (5th century)",
        "content_text": (
            "Nalanda, thriving from the 5th to 12th century, hosted thousands of "
            "students and scholars from across Asia, studying everything from "
            "Buddhist philosophy to medicine and astronomy. It was one of the world's "
            "first great residential universities. Its lesson is that open, "
            "transnational learning has long been a hallmark of Indian civilisation."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["education", "nalanda", "knowledge", "heritage"],
    },
    {
        "theme": "Economy",
        "title": "The Green Revolution (1960s)",
        "content_text": (
            "High-yielding wheat and rice varieties, backed by irrigation, fertilisers "
            "and assured procurement, ended India's dependence on imported grain in "
            "the 1960s and 1970s. It saved millions from famine and seeded rural "
            "prosperity. Its lesson is that investment in science and institutions can "
            "turn scarcity into sufficiency — while reminding us to guard against "
            "ecological and equity costs."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["economy", "agriculture", "science", "food security"],
    },
    {
        "theme": "Society",
        "title": "Child Marriage Prohibition and social reform",
        "content_text": (
            "From Raja Ram Mohan Roy's campaign against sati to the legal "
            "criminalisation of child marriage, social reform in India has repeatedly "
            "required the law to nudge social conscience. These movements show that "
            "legislation both reflects and accelerates moral change. Their lesson is "
            "that reform is a dialogue between law, custom and education."
        ),
        "source_origin": "HISTORICAL_EVENT",
        "tags": ["society", "reform", "law", "social justice"],
    },
]


ALL_ANECDOTES = ANECDOTES
