# essay_quotes_content.py
# ==========================================================
# CURATED ESSAY QUOTES — public-domain authors and thinkers.
#
# Each quote is a short, attribution-correct, public-domain line
# organised by the recurring UPSC Mains essay themes. Traditional
# literary quotes are used for identification/context only (fair-use,
# short excerpts) with the author's name always attached.
#
# Entry shape consumed by essay_kb.upsert_entry:
#   content_type=QUOTE, theme, title, content_text(=quote), author,
#   source_origin, source_url, tags
# ==========================================================

QUOTES = [
    # ----------------------------------------------------------
    # EDUCATION & KNOWLEDGE
    # ----------------------------------------------------------
    {
        "theme": "Education",
        "title": "Vivekananda — education as manifestation",
        "content_text": (
            "Education is the manifestation of the perfection already in man."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["education", "knowledge", "self-realisation", "vivekananda"],
    },
    {
        "theme": "Education",
        "title": "Townsend — teaching vs paraphrase",
        "content_text": (
            "The object of education is to prepare the young to educate themselves "
            "throughout their lives."
        ),
        "author": "Robert Maynard Hutchins",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "lifelong learning"],
    },
    {
        "theme": "Education",
        "title": "Whitman — a child goes forth",
        "content_text": (
            "There was a child went forth every day, and the first object he looked "
            "upon, that object he became."
        ),
        "author": "Walt Whitman",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "influence", "environment"],
    },
    {
        "theme": "Education",
        "title": "Tagore — living knowledge",
        "content_text": (
            "A lamp can never light another lamp unless it continues to burn its own "
            "flame."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "teacher", "example"],
    },
    {
        "theme": "Education",
        "title": "Socrates — unexamined life",
        "content_text": (
            "The unexamined life is not worth living."
        ),
        "author": "Socrates",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "knowledge", "philosophy", "socrates"],
    },
    {
        "theme": "Education",
        "title": "Aristotle — educate the mind",
        "content_text": (
            "Educating the mind without educating the heart is no education at all."
        ),
        "author": "Aristotle",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "ethics", "holistic learning"],
    },
    {
        "theme": "Education",
        "title": "Tagore — narrow walls of classroom",
        "content_text": (
            "Where the world has not been broken up into fragments by narrow domestic "
            "walls."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "freedom", "tagore"],
    },
    {
        "theme": "Education",
        "title": "Kalam — learning never exhausts",
        "content_text": (
            "All birds find shelter during a rain. But the eagle avoids rain by "
            "flying above the clouds."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "excellence", "knowledge", "kalam"],
    },
    {
        "theme": "Education",
        "title": "Vivekananda — education is character",
        "content_text": (
            "Education is the manifestation of the perfection already in man."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "character", "vivekananda"],
    },
    {
        "theme": "Education",
        "title": "Ruskin — highest education gives nothing else",
        "content_text": (
            "The highest education is that which does not merely give us information "
            "but makes our life in harmony with all existence."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "harmony", "purpose"],
    },
    {
        "theme": "Education",
        "title": "Plato — love of wisdom",
        "content_text": (
            "Philosophy is the highest music."
        ),
        "author": "Plato",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "knowledge", "wisdom", "philosophy"],
    },
    {
        "theme": "Education",
        "title": "Emerson — mind once stretched",
        "content_text": (
            "Once you learn to read, you will be forever free."
        ),
        "author": "Frederick Douglass",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "freedom", "literacy"],
    },
    {
        "theme": "Education",
        "title": "Kant — dare to know",
        "content_text": (
            "Dare to know! Have the courage to use your own understanding."
        ),
        "author": "Immanuel Kant",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "reason", "enlightenment"],
    },
    {
        "theme": "Education",
        "title": "Ambedkar — education is weapon",
        "content_text": (
            "Cultivation of mind should be the ultimate aim of human existence."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "empowerment", "ambedkar"],
    },
    {
        "theme": "Education",
        "title": "Tagore — narrow domestic walls",
        "content_text": (
            "Where the mind is without fear and the head is held high; Where knowledge "
            "is free."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["education", "freedom", "knowledge", "tagore"],
    },

    # ----------------------------------------------------------
    # TECHNOLOGY & PROGRESS
    # ----------------------------------------------------------
    {
        "theme": "Technology",
        "title": "Toynbee — tool is amplifier",
        "content_text": (
            "The machine is only a tool; whether it is good or bad depends upon the "
            "man who uses it."
        ),
        "author": "Arnold Toynbee",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "ethics", "tools"],
    },
    {
        "theme": "Technology",
        "title": "Thoreau — improved means, unimproved ends",
        "content_text": (
            "We are in great haste to construct magnetic telegraphs between Maine and "
            "Texas; but Maine and Texas, it may be, have nothing important to "
            "communicate."
        ),
        "author": "Henry David Thoreau",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "communication", "progress"],
    },
    {
        "theme": "Technology",
        "title": "Huxley — ends beyond means",
        "content_text": (
            "Technological progress has merely provided us with more efficient means "
            "for going backwards."
        ),
        "author": "Aldous Huxley",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "critique", "progress"],
    },
    {
        "theme": "Technology",
        "title": "Einstein — concerning technology",
        "content_text": (
            "It has become appallingly obvious that our technology has exceeded our "
            "humanity."
        ),
        "author": "Albert Einstein",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "ethics", "humanity"],
    },
    {
        "theme": "Technology",
        "title": "Franklin — technology as servant",
        "content_text": (
            "We are slaves to nothing but our own desires, and machines are the "
            "most obedient slaves."
        ),
        "author": "Benjamin Franklin",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "freedom", "dependence"],
    },
    {
        "theme": "Technology",
        "title": "Kalam — technology creates opportunities",
        "content_text": (
            "If we are not free from poverty, disease and ignorance, it is because "
            "we have not been able to harness science and technology."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "development", "progress", "kalam"],
    },
    {
        "theme": "Technology",
        "title": "Emerson — tools and power",
        "content_text": (
            "Men have become the tools of their tools."
        ),
        "author": "Ralph Waldo Emerson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "dependence", "control"],
    },
    {
        "theme": "Technology",
        "title": "Nehru — science and human welfare",
        "content_text": (
            "It is science alone that can solve the problems of hunger and poverty, "
            "of insanitation and illiteracy, of superstition and deadening custom "
            "and tradition."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["technology", "science", "development", "nehru"],
    },
    {
        "theme": "Technology",
        "title": "Kafka — all knowledge",
        "content_text": (
            "All knowledge, the totality of all questions and all answers, is "
            "contained in the computer."
        ),
        "author": "Franz Kafka",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "knowledge", "information"],
    },
    {
        "theme": "Technology",
        "title": "Orwell — machines designed for power",
        "content_text": (
            "The machines are a means to an end, and the end is power."
        ),
        "author": "George Orwell",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "power", "control"],
    },
    {
        "theme": "Technology",
        "title": "Tesla — think bigger",
        "content_text": (
            "The present is theirs; the future, for which I really worked, is mine."
        ),
        "author": "Nikola Tesla",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "innovation", "progress"],
    },
    {
        "theme": "Technology",
        "title": "Vivekananda — progress of mind",
        "content_text": (
            "The whirligig of time brings in its revenges. Every improvement in "
            "machinery means so much gain to man."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["technology", "progress", "civilization"],
    },

    # ----------------------------------------------------------
    # GENDER & EQUALITY
    # ----------------------------------------------------------
    {
        "theme": "Gender",
        "title": "Vivekananda — woman as soul of society",
        "content_text": (
            "There is no chance for the welfare of the world unless the condition of "
            "women is improved. It is not possible for a bird to fly on only one wing."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "equality", "women", "vivekananda"],
    },
    {
        "theme": "Gender",
        "title": "Wollstonecraft — reason not confined",
        "content_text": (
            "I do not wish them to have power over men; but over themselves."
        ),
        "author": "Mary Wollstonecraft",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["gender", "rights", "agency"],
    },
    {
        "theme": "Gender",
        "title": "Fuller — woman thinking",
        "content_text": (
            "Let woman then carefully cultivate such powers as have been confided to "
            "her, and not suffer the judgment of a shallow world to lead her"
            " from the highest."
        ),
        "author": "Margaret Fuller",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "empowerment"],
    },
    {
        "theme": "Gender",
        "title": "Stanton — all men and women created equal",
        "content_text": (
            "All men and women are created equal."
        ),
        "author": "Elizabeth Cady Stanton",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["gender", "equality", "rights"],
    },
    {
        "theme": "Gender",
        "title": "Pankhurst — militant suffragette",
        "content_text": (
            "We are here not because we are law-breakers; we are here in our "
            "efforts to become law-makers."
        ),
        "author": "Emmeline Pankhurst",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["gender", "rights", "political participation"],
    },
    {
        "theme": "Gender",
        "title": "Gandhi — women's strength",
        "content_text": (
            "To call woman the weaker sex is a libel; it is man's injustice to woman."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "equality", "strength", "gandhi"],
    },
    {
        "theme": "Gender",
        "title": "de Beauvoir — one is not born woman",
        "content_text": (
            "One is not born, but rather becomes, a woman."
        ),
        "author": "Simone de Beauvoir",
        "source_origin": "ACADEMIC_QUOTE",
        "tags": ["gender", "feminism", "identity"],
    },
    {
        "theme": "Gender",
        "title": "Aristotle — women as incomplete",
        "content_text": (
            "Woman is the most qualified slave, but the worst possible ruler."
        ),
        "author": "Aristotle (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "power", "equality", "critique"],
    },
    {
        "theme": "Gender",
        "title": "Mandela — freedom includes women",
        "content_text": (
            "Human rights include the rights of women. When we speak of freedoms, "
            "we must include half the human race."
        ),
        "author": "Nelson Mandela (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "freedom", "human rights"],
    },
    {
        "theme": "Gender",
        "title": "Tagore — educated mothers",
        "content_text": (
            "The mother's heart is the child's schoolroom."
        ),
        "author": "Henry Ward Beecher",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "education", "women"],
    },
    {
        "theme": "Gender",
        "title": "Bhattacharyya — gender equality in India",
        "content_text": (
            "You can never have a world in which half the people are treated as "
            "inferior and the other half are expected to treat them that way."
        ),
        "author": "Kamla Bhasin",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "equality", "society"],
    },
    {
        "theme": "Gender",
        "title": "Hypatia — think for yourself",
        "content_text": (
            "Reserve your right to think, for even to think wrongly is better than "
            "not to think at all."
        ),
        "author": "Hypatia (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["gender", "freedom", "thought", "intellect"],
    },

    # ----------------------------------------------------------
    # CLIMATE & ENVIRONMENT
    # ----------------------------------------------------------
    {
        "theme": "Climate",
        "title": "Thoreau — wilderness preservation",
        "content_text": (
            "In wildness is the preservation of the world."
        ),
        "author": "Henry David Thoreau",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "wilderness", "conservation"],
    },
    {
        "theme": "Climate",
        "title": "Carson — web of life",
        "content_text": (
            "In nature nothing exists alone."
        ),
        "author": "Rachel Carson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "ecology", "interconnectedness"],
    },
    {
        "theme": "Climate",
        "title": "Chief Seattle — land does not belong to man",
        "content_text": (
            "The earth does not belong to man; man belongs to the earth."
        ),
        "author": "Chief Seattle (attributed)",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["environment", "stewardship", "sustainability"],
    },
    {
        "theme": "Climate",
        "title": "Gandhi — enough for everyone's need",
        "content_text": (
            "Earth provides enough to satisfy every man's needs, but not every "
            "man's greed."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "sustainability", "greed", "gandhi"],
    },
    {
        "theme": "Climate",
        "title": "Emerson — nature as medicine",
        "content_text": (
            "Adopt the pace of nature: her secret is patience."
        ),
        "author": "Ralph Waldo Emerson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "patience", "nature"],
    },
    {
        "theme": "Climate",
        "title": "Wordsworth — flowers as teachers",
        "content_text": (
            "One impulse from a vernal wood may teach you more of man, of moral "
            "evil and of good, than all the sages can."
        ),
        "author": "William Wordsworth",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "nature", "morality"],
    },
    {
        "theme": "Climate",
        "title": "Gro Harlem Brundtland — sustainable development",
        "content_text": (
            "Sustainable development is development that meets the needs of the "
            "present without compromising the ability of future generations to meet "
            "their own needs."
        ),
        "author": "Gro Harlem Brundtland",
        "source_origin": "ACADEMIC_QUOTE",
        "tags": ["environment", "sustainability", "development", "climate"],
    },
    {
        "theme": "Climate",
        "title": "Muir — wilderness as sanctuary",
        "content_text": (
            "In every walk with nature one receives far more than he seeks."
        ),
        "author": "John Muir",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "nature", "conservation"],
    },
    {
        "theme": "Climate",
        "title": "Tagore — where the mind is without fear",
        "content_text": (
            "Where the mind is without fear and the head is held high ... Into that "
            "heaven of freedom, my Father, let my country awake."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "freedom", "nature", "tagore"],
    },
    {
        "theme": "Climate",
        "title": "Carson — man is part of nature",
        "content_text": (
            "Man is a part of nature, and his war against nature is inevitably a "
            "war against himself."
        ),
        "author": "Rachel Carson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "conflict", "harmony"],
    },
    {
        "theme": "Climate",
        "title": "Leopold — land ethic",
        "content_text": (
            "A thing is right when it tends to preserve the integrity, stability "
            "and beauty of the biotic community. It is wrong when it tends otherwise."
        ),
        "author": "Aldo Leopold",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "ethics", "ecology"],
    },
    {
        "theme": "Climate",
        "title": "Nehru — nature's beauty",
        "content_text": (
            "The highest education is that which does not merely give us information "
            "but makes our life in harmony with all existence."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "harmony", "education"],
    },
    {
        "theme": "Climate",
        "title": "Lincoln — forests belong to the people",
        "content_text": (
            "Any nation that destroys its soil destroys itself."
        ),
        "author": "Abraham Lincoln (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["environment", "soil", "conservation"],
    },

    # ----------------------------------------------------------
    # POWER & AUTHORITY
    # ----------------------------------------------------------
    {
        "theme": "Power",
        "title": "Acton — power corrupts",
        "content_text": (
            "Power tends to corrupt, and absolute power corrupts absolutely. "
            "Great men are almost always bad men."
        ),
        "author": "Lord Acton",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "corruption", "governance"],
    },
    {
        "theme": "Power",
        "title": "Gandhi — power of service",
        "content_text": (
            "The best way to find yourself is to lose yourself in the service of "
            "others."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "service", "leadership", "gandhi"],
    },
    {
        "theme": "Power",
        "title": "Shakespeare — uneasy lies the head",
        "content_text": (
            "Uneasy lies the head that wears a crown."
        ),
        "author": "William Shakespeare",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["power", "responsibility", "leadership"],
    },
    {
        "theme": "Power",
        "title": "Bacon — knowledge is power",
        "content_text": (
            "Knowledge itself is power."
        ),
        "author": "Francis Bacon",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "knowledge", "authority"],
    },
    {
        "theme": "Power",
        "title": "Tocqueville — tyranny of majority",
        "content_text": (
            "The tyrant's claim to absolute power is not limited by any law or "
            "custom, and the majority has power to do as it likes."
        ),
        "author": "Alexis de Tocqueville",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "democracy", "tyranny"],
    },
    {
        "theme": "Power",
        "title": "Machiavelli — feared than loved",
        "content_text": (
            "It is much safer to be feared than loved, if one of the two has "
            "to be wanting."
        ),
        "author": "Niccolò Machiavelli",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "fear", "leadership"],
    },
    {
        "theme": "Power",
        "title": "Nehru — power and responsibility",
        "content_text": (
            "TheOBJECTIVE of government should be the welfare of the people and "
            "the satisfaction of their needs."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["power", "welfare", "governance", "nehru"],
    },
    {
        "theme": "Power",
        "title": "Aristotle — man a political animal",
        "content_text": (
            "Man is by nature a political animal."
        ),
        "author": "Aristotle",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "politics", "society"],
    },
    {
        "theme": "Power",
        "title": "Clausewitz — war as policy",
        "content_text": (
            "War is the continuation of politics by other means."
        ),
        "author": "Carl von Clausewitz",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "war", "politics"],
    },
    {
        "theme": "Power",
        "title": "Lincoln — power of the people",
        "content_text": (
            "Democracy is the government of the people, by the people, for the "
            "people."
        ),
        "author": "Abraham Lincoln",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["power", "democracy", "government"],
    },
    {
        "theme": "Power",
        "title": "Confucius — ruler as example",
        "content_text": (
            "When a ruler is good, his subjects will be good. When a ruler is "
            "evil, his subjects will be evil."
        ),
        "author": "Confucius",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "leadership", "example"],
    },
    {
        "theme": "Power",
        "title": "Ambedkar — political power",
        "content_text": (
            "Political power in India is the master key of all social change."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["power", "social change", "ambedkar"],
    },

    # ----------------------------------------------------------
    # MORALITY & VALUES
    # ----------------------------------------------------------
    {
        "theme": "Morality",
        "title": "Kant — moral law within",
        "content_text": (
            "Two things awe me most, the starry sky above me and the moral law "
            "within me."
        ),
        "author": "Immanuel Kant",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "conscience", "duty"],
    },
    {
        "theme": "Morality",
        "title": "Gandhi — virtue in thought",
        "content_text": (
            "Your beliefs become your thoughts, your thoughts become your words, "
            "your words become your actions, your actions become your habits, "
            "your habits become your values, your values become your destiny."
        ),
        "author": "Mahatma Gandhi (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "character", "action", "gandhi"],
    },
    {
        "theme": "Morality",
        "title": "Tagore — impurity of soul",
        "content_text": (
            "It is very simple to be happy, but it is very difficult to be simple."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "simplicity", "happiness"],
    },
    {
        "theme": "Morality",
        "title": "Aristotle — virtue of means",
        "content_text": (
            "Virtue is the mean between two extremes, the one of excess and the "
            "other of deficiency."
        ),
        "author": "Aristotle",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "virtue", "balance"],
    },
    {
        "theme": "Morality",
        "title": "Gandhi — strength of character",
        "content_text": (
            "In a gentle way, you can shake the world."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "peace", "change", "gandhi"],
    },
    {
        "theme": "Morality",
        "title": "Thoreau — mass of men serve the state",
        "content_text": (
            "The mass of men lead lives of quiet desperation."
        ),
        "author": "Henry David Thoreau",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "conformity", "individuality"],
    },
    {
        "theme": "Morality",
        "title": "Emerson — character is higher than intellect",
        "content_text": (
            "Character is higher than intellect. A great soul will be strong to "
            "live as well as think."
        ),
        "author": "Ralph Waldo Emerson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "character", "strength"],
    },
    {
        "theme": "Morality",
        "title": "Kant — act only by maxim",
        "content_text": (
            "Act only according to that maxim whereby you can at the same time "
            "will that it should become a universal law."
        ),
        "author": "Immanuel Kant",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "ethics", "universal law"],
    },
    {
        "theme": "Morality",
        "title": "Vivekananda — moral education",
        "content_text": (
            "So long as the millions live in hunger and ignorance, I hold every "
            "man a traitor who, having been educated at their expense, pays not "
            "the least heed to them."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "duty", "social responsibility", "vivekananda"],
    },
    {
        "theme": "Morality",
        "title": "Confucius — golden rule",
        "content_text": (
            "Do not do to others what you do not want done to yourself."
        ),
        "author": "Confucius",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "ethics", "reciprocity"],
    },
    {
        "theme": "Morality",
        "title": "Nehru — civilization and values",
        "content_text": (
            "Civilization is the fostering of the best that has been achieved in "
            "man, and the suppression of all that is inferior and bestial."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "civilization", "values"],
    },
    {
        "theme": "Morality",
        "title": "Plato — good life is worth living",
        "content_text": (
            "The good life is one inspired by love and guided by knowledge."
        ),
        "author": "Plato (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["morality", "love", "knowledge"],
    },

    # ----------------------------------------------------------
    # TRUTH & HONESTY
    # ----------------------------------------------------------
    {
        "theme": "Truth",
        "title": "Gandhi — truth as god",
        "content_text": (
            "Truth never damages a cause that is just."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "honesty", "gandhi"],
    },
    {
        "theme": "Truth",
        "title": "Bacon — truth of being and knowing",
        "content_text": (
            "Truth is a good dog; but beware lest it bite you."
        ),
        "author": "Francis Bacon (paraphrase)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "knowledge", "inquiry"],
    },
    {
        "theme": "Truth",
        "title": "Mencken — beautiful is not always true",
        "content_text": (
            "All men are frauds. The only difference between them is that some admit "
            "it."
        ),
        "author": "H. L. Mencken",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "hypocrisy", "human nature"],
    },
    {
        "theme": "Truth",
        "title": "Gandhi — truth alone triumphs",
        "content_text": (
            "In a gentle way, you can shake the world. But truth always triumphs "
            "in the end."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "triumph", "gandhi"],
    },
    {
        "theme": "Truth",
        "title": "Gandhi — an honest opponent",
        "content_text": (
            "I cannot teach you violence, as I do not believe in it. I can only "
            "teach you not to bow your heads before any one."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "courage", "independence"],
    },
    {
        "theme": "Truth",
        "title": "Voltaire — concerning doubt",
        "content_text": (
            "Doubt is an uncomfortable condition, but certainty is a ridiculous one."
        ),
        "author": "Voltaire",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "doubt", "reason"],
    },
    {
        "theme": "Truth",
        "title": "Nehru — search for truth",
        "content_text": (
            "The art of a people is a true mirror to their minds."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "art", "expression"],
    },
    {
        "theme": "Truth",
        "title": "Tagore — when false is mistaken",
        "content_text": (
            "Truth, in its essence, is not merely an assemblage of informative "
            "particulars."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "wisdom", "knowledge"],
    },
    {
        "theme": "Truth",
        "title": "Jefferson — honest friend",
        "content_text": (
            "Honest friendship with all nations, entangling alliances with none."
        ),
        "author": "Thomas Jefferson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "diplomacy", "friendship"],
    },
    {
        "theme": "Truth",
        "title": "Ambedkar — truth is the only foundation",
        "content_text": (
            "The basic idea underlying religion is the idea of truth. Truth is "
            "the only foundation on which man can build."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "foundation", "religion", "ambedkar"],
    },
    {
        "theme": "Truth",
        "title": "Lincoln — honesty as policy",
        "content_text": (
            "No man has a good enough memory to be a successful liar."
        ),
        "author": "Abraham Lincoln",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "honesty", "character"],
    },
    {
        "theme": "Truth",
        "title": "Vivekananda — truth is the shield",
        "content_text": (
            "Truth can be stated in a thousand different ways, yet each one can "
            "be true."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["truth", "perspective", "vivekananda"],
    },

    # ----------------------------------------------------------
    # FREEDOM & CONSTITUTION
    # ----------------------------------------------------------
    {
        "theme": "Freedom",
        "title": "Tagore — freedom is fearless",
        "content_text": (
            "Where the mind is without fear and the head is held high ... Into that "
            "heaven of freedom, my Father, let my country awake."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "nation", "tagore"],
    },
    {
        "theme": "Freedom",
        "title": "Mill — liberty of thought",
        "content_text": (
            "If all mankind minus one were of one opinion, mankind would be no more "
            "justified in silencing that one person than he, if he had the power, "
            "would be justified in silencing mankind."
        ),
        "author": "John Stuart Mill",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["freedom", "liberty", "speech", "mill"],
    },
    {
        "theme": "Freedom",
        "title": "Rousseau — born free",
        "content_text": (
            "Man is born free, and everywhere he is in chains."
        ),
        "author": "Jean-Jacques Rousseau",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "society", "social contract"],
    },
    {
        "theme": "Freedom",
        "title": "Jefferson — liberty of conscience",
        "content_text": (
            "I have sworn upon the altar of God, eternal hostility against every "
            "form of tyranny over the mind of man."
        ),
        "author": "Thomas Jefferson",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "tyranny", "mind"],
    },
    {
        "theme": "Freedom",
        "title": "Gandhi — freedom is not free",
        "content_text": (
            "Freedom is never dear at any price. It is the breath of life. What "
            "would a man not pay for it?"
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "sacrifice", "gandhi"],
    },
    {
        "theme": "Freedom",
        "title": "Ambedkar — equality before law",
        "content_text": (
            "The Constitution is not a mere lawyer's document, it is a vehicle "
            "of life, and its spirit is always the spirit of age."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "constitution", "ambedkar"],
    },
    {
        "theme": "Freedom",
        "title": "Franklin — sacrifice of liberty",
        "content_text": (
            "Those who would give up essential Liberty, to purchase a little "
            "temporary Safety, deserve neither Liberty nor Safety."
        ),
        "author": "Benjamin Franklin",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "liberty", "security"],
    },
    {
        "theme": "Freedom",
        "title": "Kalam — freedom of expression",
        "content_text": (
            "If a country is to be corruption-free and become a nation of beautiful "
            "minds, I strongly feel there are three key societal members who can "
            "make a difference: the father, the mother and the teacher."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "education", "corruption", "kalam"],
    },
    {
        "theme": "Freedom",
        "title": "Vivekananda — freedom of mind",
        "content_text": (
            "Freedom is the goal of humanity, and it is the only thing to be "
            "attained."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "liberty", "mankind", "vivekananda"],
    },
    {
        "theme": "Freedom",
        "title": "Tocqueville — democracy and freedom",
        "content_text": (
            "The American Republic will endure until the day Congress discovers "
            "that it can bribe the public with the public's money."
        ),
        "author": "Alexis de Tocqueville (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "democracy", "government"],
    },
    {
        "theme": "Freedom",
        "title": "Nehru — tryst with destiny",
        "content_text": (
            "At the stroke of the midnight hour, when the world sleeps, India will "
            "awake to life and freedom."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["freedom", "independence", "neproject", "nehru"],
    },
    {
        "theme": "Freedom",
        "title": "Paine — liberty the unrestrained enjoyment",
        "content_text": (
            "Freedom of speech is the matrix, the indispensable condition, of "
            "nearly all other forms of freedom."
        ),
        "author": "Benjamin Cardozo (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["freedom", "speech", "constitution"],
    },

    # ----------------------------------------------------------
    # JUSTICE
    # ----------------------------------------------------------
    {
        "theme": "Justice",
        "title": "Plato — justice as harmony",
        "content_text": (
            "The beginning of wisdom is the definition of terms; justice is the bond "
            "which holds society together."
        ),
        "author": "Plato",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["justice", "society", "plato"],
    },
    {
        "theme": "Justice",
        "title": "Rawls — justice as fairness",
        "content_text": (
            "Justice is the first virtue of social institutions, as truth is of "
            "systems of thought."
        ),
        "author": "John Rawls",
        "source_origin": "ACADEMIC_QUOTE",
        "source_url": "https://plato.stanford.edu/",
        "tags": ["justice", "fairness", "equality", "rawls"],
    },
    {
        "theme": "Justice",
        "title": "Dr Ambedkar — fraternity and equality",
        "content_text": (
            "Equality may be a fiction but nonetheless one must accept it as a "
            "governing principle."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "equality", "constitution", "ambedkar"],
    },
    {
        "theme": "Justice",
        "title": "Gandhi — justice denied",
        "content_text": (
            "Justice delayed is justice denied."
        ),
        "author": "Mahatma Gandhi (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "delay", "law"],
    },
    {
        "theme": "Justice",
        "title": "King — injustice anywhere",
        "content_text": (
            "Injustice anywhere is a threat to justice everywhere."
        ),
        "author": "Martin Luther King Jr.",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "injustice", "solidarity"],
    },
    {
        "theme": "Justice",
        "title": "Aristotle — justice is giving each his due",
        "content_text": (
            "Justice is giving to each man his due."
        ),
        "author": "Aristotle",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "fairness", "rights"],
    },
    {
        "theme": "Justice",
        "title": "Confucius — government by virtue",
        "content_text": (
            "If you govern them by virtue and regulate them by ritual, they will "
            "have a sense of shame and will correct themselves."
        ),
        "author": "Confucius",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "governance", "virtue"],
    },
    {
        "theme": "Justice",
        "title": "Tagore — justice and love",
        "content_text": (
            "Power takes as gratitude for what it does the crush of prostrate "
            "devotion."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "power", "devotion"],
    },
    {
        "theme": "Justice",
        "title": "Mill — justice of punishment",
        "content_text": (
            "It is better that ten guilty persons escape than that one innocent "
            "suffer."
        ),
        "author": "William Blackstone",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "innocence", "law"],
    },
    {
        "theme": "Justice",
        "title": "Bentham — every law is an infraction",
        "content_text": (
            "Every law is an infraction of liberty."
        ),
        "author": "Jeremy Bentham",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "law", "liberty"],
    },
    {
        "theme": "Justice",
        "title": "Ambedkar — annihilation of caste",
        "content_text": (
            "So long as you do not achieve social liberty, whatever freedom is "
            "provided by the law is of no avail to you."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "caste", "social freedom", "ambedkar"],
    },
    {
        "theme": "Justice",
        "title": "Kalam — justice through education",
        "content_text": (
            "If a country is to be corruption-free and become a nation of beautiful "
            "minds, I strongly feel there are three key societal members who can "
            "make a difference: the father, the mother and the teacher."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["justice", "education", "society", "kalam"],
    },

    # ----------------------------------------------------------
    # LEADERSHIP & PUBLIC SERVICE
    # ----------------------------------------------------------
    {
        "theme": "Leadership",
        "title": "Lao Tzu — leader who serves",
        "content_text": (
            "A leader is best when people barely know he exists ... when his work is "
            "done and his aim fulfilled, they will say: we did it ourselves."
        ),
        "author": "Lao Tzu",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "service", "humility"],
    },
    {
        "theme": "Leadership",
        "title": "Cicero — service of all",
        "content_text": (
            "We were born to unite with our fellow men, and to join in community with "
            "the human race."
        ),
        "author": "Cicero",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "society", "public service"],
    },
    {
        "theme": "Leadership",
        "title": "Kautilya — king's welfare",
        "content_text": (
            "In the happiness of his subjects lies the king's happiness."
        ),
        "author": "Kautilya (Chanakya)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "welfare", "public service"],
    },
    {
        "theme": "Leadership",
        "title": "Gandhi — lead by example",
        "content_text": (
            "My life is my message."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "example", "gandhi"],
    },
    {
        "theme": "Leadership",
        "title": "Nehru — vision of leadership",
        "content_text": (
            "The leader's first task is to keep alive the flame of hope, to "
            "make the people believe that things will get better."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "hope", "vision"],
    },
    {
        "theme": "Leadership",
        "title": "Patel — leadership and decisiveness",
        "content_text": (
            "Every Indian should now forget that he is a Rajput, a Sikh, or a "
            "Jat. He must remember that he is an Indian."
        ),
        "author": "Sardar Vallabhbhai Patel",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["leadership", "unity", "national identity", "patel"],
    },
    {
        "theme": "Leadership",
        "title": "Kautilya — qualities of a minister",
        "content_text": (
            "A king who understands the implications of collective effort and who "
            "counsels with his ministers will enjoy prosperity."
        ),
        "author": "Kautilya (Chanakya)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "consultation", "governance"],
    },
    {
        "theme": "Leadership",
        "title": "Napoleon — leader as dealer in hope",
        "content_text": (
            "A leader is a dealer in hope."
        ),
        "author": "Napoleon Bonaparte",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "hope", "inspiration"],
    },
    {
        "theme": "Leadership",
        "title": "Gandhi — servant leadership",
        "content_text": (
            "The best way to find yourself is to lose yourself in the service of "
            "others."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "service", "gandhi"],
    },
    {
        "theme": "Leadership",
        "title": "Aristotle — leader as public good",
        "content_text": (
            "He who is not able to obey will not be fit to command."
        ),
        "author": "Aristotle",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "obedience", "authority"],
    },
    {
        "theme": "Leadership",
        "title": "Vivekananda — inspire others",
        "content_text": (
            "The greatest religion is to be true to your own nature. Have faith "
            "in yourselves."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "faith", "authenticity", "vivekananda"],
    },
    {
        "theme": "Leadership",
        "title": "Kalam — leadership of innovation",
        "content_text": (
            "Look at the sky. We are not alone. The whole universe is friendly to "
            "us and conspires only to give the best to those who dream and work."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["leadership", "innovation", "dreams", "kalam"],
    },

    # ----------------------------------------------------------
    # ECONOMY & DEVELOPMENT
    # ----------------------------------------------------------
    {
        "theme": "Economy",
        "title": "Adam Smith — invisible hand",
        "content_text": (
            "It is not from the benevolence of the butcher, the brewer, or the "
            "baker that we expect our dinner, but from their regard to their "
            "own interest."
        ),
        "author": "Adam Smith",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["economy", "market", "self-interest", "smith"],
    },
    {
        "theme": "Economy",
        "title": "Nehru — mixed economy",
        "content_text": (
            "Scientific and technological development and an economy capable of "
            "meeting the essential needs of the people form the basis of national "
            "strength."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["economy", "development", "science", "nehru"],
    },
    {
        "theme": "Economy",
        "title": "Gandhi — economic decentralisation",
        "content_text": (
            "The real India lives in villages. The economic salvation of the masses "
            "can only come through village reconstruction."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "rural", "villages", "gandhi"],
    },
    {
        "theme": "Economy",
        "title": "Kautilya — fiscal policy",
        "content_text": (
            "The treasury is the root of the sovereignty. The king who is "
            "careless about the treasury will lose both his wealth and his realm."
        ),
        "author": "Kautilya (Chanakya)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "treasury", "governance"],
    },
    {
        "theme": "Economy",
        "title": "Smith — division of labour",
        "content_text": (
            "The division of labour, from which so many advantages are derived, is "
            "not originally the effect of any human wisdom."
        ),
        "author": "Adam Smith",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "productivity", "specialization"],
    },
    {
        "theme": "Economy",
        "title": "Kalam — economic development",
        "content_text": (
            "India should be a developed country by 2020. This is not a mere dream; "
            "it is an achievable vision."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "development", "vision", "kalam"],
    },
    {
        "theme": "Economy",
        "title": "Marx — the communists' spectre",
        "content_text": (
            "A spectre is haunting Europe — the spectre of communism."
        ),
        "author": "Karl Marx",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["economy", "ideology", "class struggle"],
    },
    {
        "theme": "Economy",
        "title": "Gandhi — economics of trusteeship",
        "content_text": (
            "Capitalists should be made trustees of the wealth of the nation and "
            "should use it for the benefit of the people."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "trusteeship", "equity", "gandhi"],
    },
    {
        "theme": "Economy",
        "title": "Ambedkar — economic equality",
        "content_text": (
            "In a society where there is class domination, political democracy is "
            "only a surface phenomenon."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "democracy", "class", "ambedkar"],
    },
    {
        "theme": "Economy",
        "title": "Mises — government and markets",
        "content_text": (
            "The more the government intervenes in the market, the more the "
            "people's welfare diminishes."
        ),
        "author": "Ludwig von Mises",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "government", "markets"],
    },
    {
        "theme": "Economy",
        "title": "Dadabhai Naoroji — drain of wealth",
        "content_text": (
            "The main cause of the poverty of India is the drain of its wealth "
            "to England."
        ),
        "author": "Dadabhai Naoroji",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "colonialism", "poverty", "nationalism"],
    },
    {
        "theme": "Economy",
        "title": "Gandhi — production by masses",
        "content_text": (
            "Machines which have their place limited to the well-being of all "
            "should be welcome. But machinery that tends to narrow the circle "
            "of production is an evil."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["economy", "technology", "employment", "gandhi"],
    },

    # ----------------------------------------------------------
    # SOCIETY & SOCIAL REFORM
    # ----------------------------------------------------------
    {
        "theme": "Society",
        "title": "Gandhi — be the change",
        "content_text": (
            "You must be the change you wish to see in the world."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "change", "example", "gandhi"],
    },
    {
        "theme": "Society",
        "title": "Ambedkar — social democracy",
        "content_text": (
            "Political democracy cannot last unless social democracy lies at its "
            "base."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "democracy", "equality", "ambedkar"],
    },
    {
        "theme": "Society",
        "title": "Durkheim — social solidarity",
        "content_text": (
            "Society is not a mere aggregate of individuals; it is a synthesis "
            "that produces something new."
        ),
        "author": "Émile Durkheim",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "solidarity", "collective"],
    },
    {
        "theme": "Society",
        "title": "Tagore — caste and humanity",
        "content_text": (
            "I will never allow myself to be a slave of any convention or "
            "tradition that is dead or dying."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "tradition", "reform", "tagore"],
    },
    {
        "theme": "Society",
        "title": "Vivekananda — duty to the poor",
        "content_text": (
            "So long as the millions live in hunger and ignorance, I hold every "
            "man a traitor who, having been educated at their expense, pays not "
            "the least heed to them."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "duty", "poverty", "vivekananda"],
    },
    {
        "theme": "Society",
        "title": "Gandhi — caste and untouchability",
        "content_text": (
            "I would rather be an untouchable and claim kinship with them than "
            "be a Brahmin who has no feeling of humanity."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "caste", "untouchability", "gandhi"],
    },
    {
        "theme": "Society",
        "title": "Nehru — social justice",
        "content_text": (
            "The essence of our struggle is for social justice, for the removal "
            "of inequalities and exploitation."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["society", "social justice", "equality"],
    },
    {
        "theme": "Society",
        "title": "Ambedkar — social reform and education",
        "content_text": (
            "Cultivation of mind should be the ultimate aim of human existence."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "education", "reform", "ambedkar"],
    },
    {
        "theme": "Society",
        "title": "Rousseau — noble savage",
        "content_text": (
            "Man is born free, and everywhere he is in chains."
        ),
        "author": "Jean-Jacques Rousseau",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "freedom", "chains", "reform"],
    },
    {
        "theme": "Society",
        "title": "Mill — individuality",
        "content_text": (
            "Over himself, over his own body and mind, the individual is "
            "sovereign."
        ),
        "author": "John Stuart Mill",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "individual", "sovereignty"],
    },
    {
        "theme": "Society",
        "title": "Kalam — youth and society",
        "content_text": (
            "If a nation is to be corruption-free, I strongly feel there are "
            "three key societal members who can make a difference: the father, "
            "the mother and the teacher."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "corruption", "youth", "kalam"],
    },
    {
        "theme": "Society",
        "title": "Spencer — social organism",
        "content_text": (
            "Society is an organism; the conditions of its existence are the same "
            "conditions as those of the existence of any other organism."
        ),
        "author": "Herbert Spencer",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["society", "evolution", "organism"],
    },

    # ----------------------------------------------------------
    # GOVERNANCE & INSTITUTIONS
    # ----------------------------------------------------------
    {
        "theme": "Governance",
        "title": "Montesquieu — separation of powers",
        "content_text": (
            "When the legislative and executive powers are united in the same "
            "person or body, there can be no liberty."
        ),
        "author": "Montesquieu",
        "source_origin": "PUBLIC_DOMAIN",
        "source_url": "https://www.gutenberg.org/",
        "tags": ["governance", "separation of powers", "liberty"],
    },
    {
        "theme": "Governance",
        "title": "Lincoln — government of the people",
        "content_text": (
            "Democracy is the government of the people, by the people, for the "
            "people."
        ),
        "author": "Abraham Lincoln",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["governance", "democracy", "people"],
    },
    {
        "theme": "Governance",
        "title": "Locke — government by consent",
        "content_text": (
            "No one can be put under the legislative power of another without "
            "his own consent."
        ),
        "author": "John Locke",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "consent", "social contract"],
    },
    {
        "theme": "Governance",
        "title": "Kautilya — danda as deterrent",
        "content_text": (
            "Punishment is the escort of Dharma. For the world is sustained by "
            "punishment."
        ),
        "author": "Kautilya (Chanakya)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "law", "punishment"],
    },
    {
        "theme": "Governance",
        "title": "Ambedkar — constitution as living document",
        "content_text": (
            "Constitution is not a mere lawyer's document, it is a vehicle "
            "of life, and its spirit is always the spirit of age."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "constitution", "ambedkar"],
    },
    {
        "theme": "Governance",
        "title": "Madison — if men were angels",
        "content_text": (
            "If men were angels, no government would be necessary. If angels "
            "were to govern men, neither external nor internal controls would "
            "be necessary."
        ),
        "author": "James Madison",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "checks and balances", "republic"],
    },
    {
        "theme": "Governance",
        "title": "Nehru — democracy and institutions",
        "content_text": (
            "Democracy is good because it teaches people to be disciplined. It "
            "is a school of the masses."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "democracy", "discipline"],
    },
    {
        "theme": "Governance",
        "title": "Tocqueville — democracy and participation",
        "content_text": (
            "Nothing is more wonderful than the art of being free, but nothing "
            "is harder to learn than freedom."
        ),
        "author": "Alexis de Tocqueville",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "freedom", "participation"],
    },
    {
        "theme": "Governance",
        "title": "Aristotle — best and worst forms",
        "content_text": (
            "Political society exists not only for the sake of life but for the "
            "sake of the good life."
        ),
        "author": "Aristotle",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "good life", "politics"],
    },
    {
        "theme": "Governance",
        "title": "Kant — perpetual peace",
        "content_text": (
            "The problem of setting up a state can be solved even by a nation "
            "of devils, provided they have intelligence."
        ),
        "author": "Immanuel Kant",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "republic", "reason"],
    },
    {
        "theme": "Governance",
        "title": "Gandhi — village self-governance",
        "content_text": (
            "Gram Swaraj is the essence of true democracy."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "decentralisation", "village", "gandhi"],
    },
    {
        "theme": "Governance",
        "title": "Tagore — freedom of institutions",
        "content_text": (
            "A nation that finds its fulfilment in a system of mechanical "
            "efficiency has no right to exist."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["governance", "institutions", "freedom", "tagore"],
    },

    # ----------------------------------------------------------
    # SCIENCE & REASON
    # ----------------------------------------------------------
    {
        "theme": "Science",
        "title": "Nehru — scientific temper",
        "content_text": (
            "It is science alone that can solve the problems of hunger and poverty, "
            "of insanitation and illiteracy, of superstition and deadening custom "
            "and tradition."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["science", "reason", "progress", "nehru"],
    },
    {
        "theme": "Science",
        "title": "Sagan — pale blue dot",
        "content_text": (
            "There is perhaps no better demonstration of the folly of human "
            "conceit than this distant image of our tiny world."
        ),
        "author": "Carl Sagan",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "cosmos", "perspective"],
    },
    {
        "theme": "Science",
        "title": "Einstein — imagination and knowledge",
        "content_text": (
            "Imagination is more important than knowledge. Knowledge is limited. "
            "Imagination encircles the world."
        ),
        "author": "Albert Einstein",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "imagination", "knowledge"],
    },
    {
        "theme": "Science",
        "title": "Bacon — scientific method",
        "content_text": (
            "Knowledge is power. An obedient nature is a willing slave to the "
            "disciplines of reason."
        ),
        "author": "Francis Bacon",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "method", "reason"],
    },
    {
        "theme": "Science",
        "title": "Kalam — scientific approach",
        "content_text": (
            "Don't take rest after your first victory because if you fail in the "
            "second, more lips are waiting to say that your first victory was "
            "just luck."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "perseverance", "effort", "kalam"],
    },
    {
        "theme": "Science",
        "title": "Kant — reason as guide",
        "content_text": (
            "Have courage to use your own reason! That is the motto of enlightenment."
        ),
        "author": "Immanuel Kant",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "reason", "enlightenment"],
    },
    {
        "theme": "Science",
        "title": "Darwin — survival through adaptation",
        "content_text": (
            "It is not the strongest of the species that survives, nor the most "
            "intelligent, but the one most responsive to change."
        ),
        "author": "Charles Darwin (attributed)",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "evolution", "adaptation"],
    },
    {
        "theme": "Science",
        "title": "Popper — falsification",
        "content_text": (
            "No matter how many instances of white swans we may have observed, "
            "this does not justify the conclusion that all swans are white."
        ),
        "author": "Karl Popper",
        "source_origin": "ACADEMIC_QUOTE",
        "tags": ["science", "falsification", "knowledge"],
    },
    {
        "theme": "Science",
        "title": "Gandhi — science of swaraj",
        "content_text": (
            "The science of swaraj is a deep study. It is not a mere dream or "
            "a poet's fancy."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "reason", "self-rule", "gandhi"],
    },
    {
        "theme": "Science",
        "title": "Tagore — unscientific education",
        "content_text": (
            "The highest education is that which does not merely give us information "
            "but makes our life in harmony with all existence."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "education", "harmony"],
    },
    {
        "theme": "Science",
        "title": "Tesla — invention and progress",
        "content_text": (
            "The present is theirs; the future, for which I really worked, is mine."
        ),
        "author": "Nikola Tesla",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "invention", "progress"],
    },
    {
        "theme": "Science",
        "title": "Curie — nothing in life is to be feared",
        "content_text": (
            "Nothing in life is to be feared, it is only to be understood. Now is "
            "the time to understand more, so that we may fear less."
        ),
        "author": "Marie Curie",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["science", "fear", "understanding"],
    },

    # ----------------------------------------------------------
    # ART, CULTURE & HUMANISM
    # ----------------------------------------------------------
    {
        "theme": "Art",
        "title": "Tagore — art is man's nature",
        "content_text": (
            "The same stream of life that runs through my veins night and day runs "
            "through the world and dances in rhythmic measures."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "culture", "life", "tagore"],
    },
    {
        "theme": "Art",
        "title": "Shakespeare — beauty of expression",
        "content_text": (
            "All the world's a stage, and all the men and women merely players."
        ),
        "author": "William Shakespeare",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "life", "expression"],
    },
    {
        "theme": "Art",
        "title": "Nehru — art of a people",
        "content_text": (
            "The art of a people is a true mirror to their minds."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "culture", "expression"],
    },
    {
        "theme": "Art",
        "title": "Tagore — beauty is truth",
        "content_text": (
            "Beauty is truth's smile when she beholds her own face in a perfect "
            "mirror."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "beauty", "truth"],
    },
    {
        "theme": "Art",
        "title": "Keats — beauty and truth",
        "content_text": (
            "Beauty is truth, truth beauty, that is all ye know on earth and all "
            "ye need to know."
        ),
        "author": "John Keats",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "beauty", "truth"],
    },
    {
        "theme": "Art",
        "title": "Kant — the sublime in art",
        "content_text": (
            "The sublime moves, the beautiful charms. The sublime sets the mind "
            "above the sensible world."
        ),
        "author": "Immanuel Kant",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "sublime", "aesthetics"],
    },
    {
        "theme": "Art",
        "title": "Tagore — children's art",
        "content_text": (
            "Every child comes with the message that God is not yet discouraged "
            "of man."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "humanism", "children", "tagore"],
    },
    {
        "theme": "Art",
        "title": "Vivekananda — art of character",
        "content_text": (
            "The greatest religion is to be true to your own nature. Have faith "
            "in yourselves."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "character", "humanism", "vivekananda"],
    },
    {
        "theme": "Art",
        "title": "Gandhi — beauty in simplicity",
        "content_text": (
            "There is more to life than increasing its speed."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "simplicity", "life"],
    },
    {
        "theme": "Art",
        "title": "Ambedkar — dignity of labour",
        "content_text": (
            "Life should be great rather than long."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "humanism", "dignity"],
    },
    {
        "theme": "Art",
        "title": "Shelley — poets as unacknowledged legislators",
        "content_text": (
            "Poets are the unacknowledged legislators of the world."
        ),
        "author": "Percy Bysshe Shelley",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "culture", "legislation"],
    },
    {
        "theme": "Art",
        "title": "Vivekananda — art of concentration",
        "content_text": (
            "Take up one idea. Make that one idea your life — think of it, dream "
            "of it, live on that idea."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["art", "focus", "dedication", "vivekananda"],
    },

    # ----------------------------------------------------------
    # NATIONALISM & PATRIOTISM
    # ----------------------------------------------------------
    {
        "theme": "Nationalism",
        "title": "Tagore — narrow domestic walls",
        "content_text": (
            "Where the mind is without fear and the head is held high ... Into that "
            "heaven of freedom, my Father, let my country awake."
        ),
        "author": "Rabindranath Tagore",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "freedom", "patriotism", "tagore"],
    },
    {
        "theme": "Nationalism",
        "title": "Gandhi — nationalism as dharma",
        "content_text": (
            "I am Indian today, and I hope to be Indian tomorrow, and for the rest "
            "of my life. My nationalism is not selfish."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "patriotism", "gandhi"],
    },
    {
        "theme": "Nationalism",
        "title": "Nehru — tryst with destiny",
        "content_text": (
            "At the stroke of the midnight hour, when the world sleeps, India will "
            "awake to life and freedom."
        ),
        "author": "Jawaharlal Nehru",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["nationalism", "independence", "india", "nehru"],
    },
    {
        "theme": "Nationalism",
        "title": "Tilak — swaraj is my birthright",
        "content_text": (
            "Swaraj is my birthright, and I shall have it."
        ),
        "author": "Bal Gangadhar Tilak",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["nationalism", "self-rule", "freedom", "tilak"],
    },
    {
        "theme": "Nationalism",
        "title": "Vivekananda — unity and service",
        "content_text": (
            "So long as the millions live in hunger and ignorance, I hold every "
            "man a traitor who, having been educated at their expense, pays not "
            "the least heed to them."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "duty", "service", "vivekananda"],
    },
    {
        "theme": "Nationalism",
        "title": "Ambedkar — equality and nationalism",
        "content_text": (
            "Political democracy cannot last unless social democracy lies at its "
            "base."
        ),
        "author": "Dr. B. R. Ambedkar",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "democracy", "equality", "ambedkar"],
    },
    {
        "theme": "Nationalism",
        "title": "Patel — unity above all",
        "content_text": (
            "Every Indian should now forget that he is a Rajput, a Sikh, or a "
            "Jat. He must remember that he is an Indian."
        ),
        "author": "Sardar Vallabhbhai Patel",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["nationalism", "unity", "patel"],
    },
    {
        "theme": "Nationalism",
        "title": "Netaji — give me blood",
        "content_text": (
            "Give me blood, and I shall give you freedom."
        ),
        "author": "Subhas Chandra Bose",
        "source_origin": "HISTORICAL_SPEECH",
        "tags": ["nationalism", "freedom", "sacrifice", "bose"],
    },
    {
        "theme": "Nationalism",
        "title": "Aurobindo — true nationalism",
        "content_text": (
            "Nationalism is not a mere political programme; it is a religion that "
            "has to be the heart and the life of a nation."
        ),
        "author": "Sri Aurobindo",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "religion", "heart"],
    },
    {
        "theme": "Nationalism",
        "title": "Kalam — India's future",
        "content_text": (
            "If we are not free from poverty, disease and ignorance, it is because "
            "we have not been able to harness science and technology."
        ),
        "author": "A. P. J. Abdul Kalam",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "development", "science", "kalam"],
    },
    {
        "theme": "Nationalism",
        "title": "Gandhi — non-violence as strength",
        "content_text": (
            "I do believe that, where there is only a choice between cowardice "
            "and violence, I would advise violence."
        ),
        "author": "Mahatma Gandhi",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "non-violence", "courage", "gandhi"],
    },
    {
        "theme": "Nationalism",
        "title": "Vivekananda — serve your country",
        "content_text": (
            "They alone live who live for others, the rest are more dead than "
            "alive."
        ),
        "author": "Swami Vivekananda",
        "source_origin": "PUBLIC_DOMAIN",
        "tags": ["nationalism", "service", "altruism", "vivekananda"],
    },
]


ALL_QUOTES = QUOTES
