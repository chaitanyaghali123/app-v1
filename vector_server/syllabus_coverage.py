import sys
sys.path.insert(0, "/app")
import ingest_hybrid as IH
import psycopg2

SYLLABUS = [
 ("GS1","culture: art/architecture/literature",
   [r"classical dancer?\b|martial art|folk of|Indian art|cave architecture|temple architect|salient features of Indian culture|literary tradition|Sangam literature|Vedic literature|ancient sculpture|Ajanta|Ellora|Khajuraho|Bharatanatyam|Kathakali|Raga|miniature painting|Gandhara|Mughal painting"]),
 ("GS1","modern history / freedom struggle",
   [r"Revolt of 1857|Sepoy Mutiny|Indian National Congress|partition of Bengal|Swadeshi movement|Home Rule League|Jallianwala|Non-Cooperation|Civil Disobedience|Salt March|Quit India|Cabinet Mission|Mountbatten Plan|Partition of India|Champaran|Kheda|August offer|Cripps Mission|494-\d|Red Shirts|Ghadar"]),
 ("GS1","world history 18th-20th cent",
   [r"Industrial Revolution|French Revolution|Scientific Revolution|World War [I1]{1,2}|Treaty of Versailles|League of Nations|Bolshevik Revolution|Russian Revolution|Chinese Revolution|Cold War|decolonisation|anti-colonial|Berlin Conference|Great Depression|welfare state"]),
 ("GS1","indian society / social issues",
   [r"caste system|untouchab|linguistic diversity|religious diversity|joint family|urbanisation|internal migration|women(\'s|s')? empowerment|gender gap|sex ratio|child marriage|demographic dividend|ageing population|globalisation of Indian|social empowerment|communalism|regionalism|secularism"]),
 ("GS1","world physical geography / geophysical phenomena",
   [r"monsoon system|tropical cyclone|western disturbance|jet stream|El Nino|La Nina|plate tectonics|volcanic eruption|seismic zone|tsunami warning|glacial retreat|river erosion|delta formation|soil formation|continental drift|mid-oceanic ridge"]),
 ("GS1","resource distribution / industry location",
   [r"iron ore deposit|coal belt|petroleum reserve|natural gas field|industrial location|location of industries|textile industry|cotton textile|iron and steel plant|agro-based industry|mineral belt|hydel power potential|wind power potential|marine resource"]),
 ("GS2","constitution & institutions",
   [r"Fundamental Right|Directive Principle|basic structure doctrine|preamble of|constitutional amendment|judicial review|separation of powers|Supreme Court of India|High Court of India|Election Commission of India|Union Public Service Commission|Comptroller and Auditor|dispute redressal|constitutional body|Governor of a state|President of India"]),
 ("GS2","federalism & devolution",
   [r"Union List|State List|Concurrent List|Seventh Schedule|fiscal federalism|Finance Commission|GST Council|devolution of power|Panchayati Raj|73rd Amendment|74th Amendment|local self-government|decentralisation|inter-state river dispute|Art. 356|President's Rule"]),
 ("GS2","parliament / state legislature / separation",
   [r"Lok Sabha|Rajya Sabha|Question Hour|Zero Hour|Money Bill|Finance Bill|no-confidence motion|impeachment|parliamentary privilege|Speaker of Lok Sabha|anti-defection|seat reservation|delimitation|proportional representation|hung assembly"]),
 ("GS2","statutory & quasi-judicial bodies",
   [r"National Human Rights Commission|Scheduled Castes Commission|National Commission for Women|Central Vigilance Commission|Lokpal|Lokayukta|Central Information Commission|SEBI|TRAI|IRDA|Competition Commission of India|statutory body|quasi-judicial|ombudsman"]),
 ("GS2","welfare schemes / vulnerable sections",
   [r"MGNREGA|PM-KISAN|Ayushman Bharat|PM Awas Yojana|Beti Bachao|Jan Dhan|Poshan Abhiyan|NFSA|Mid-Day Meal|PDS|ration card|social audit|vulnerable sections|welfare scheme|universal healthcare|right to food|old age pension"]),
 ("GS2","health / education / social sector",
   [r"public health|immunisation programme|child vaccination|maternal mortality|infant mortality|health infrastructure|Right to Education|National Education Policy|gross enrolment|dropout rate|skill development|functional literacy|out-of-pocket expenditure"]),
 ("GS2","poverty & hunger",
   [r"multidimensional poverty|poverty line|below poverty line|hunger index|chronic hunger|food and nutrition security|undernutrition|nutritional security|NFHS|Tendulkar Committee|Rangarajan"]),
 ("GS2","governance / transparency / e-governance",
   [r"e-governance|Digital India|Good Governance Index|citizens charter|Right to Information|social audit|transparency in governance|accountability framework|grievance redressal|service delivery|civil services|\w+ corruption|second administrative reform|surrogate"]),
 ("GS2","India & neighbourhood",
   [r"India.Nepal|India.Bhutan|India.Bangladesh|India.Sri Lanka|India.Myanmar|SAARC|BIMSTEC|LAC|Line of Actual Control|India.China border|water sharing|Teesta|Kabul river|Mekong|Chabahar|India.Maldives"]),
 ("GS2","global groupings / diaspora / foreign policy",
   [r"ASEAN|G20 summit|BRICS|SCO|Quad|United Nations Security Council|IMF|World Bank|WTO dispute|regional grouping|diaspora|PIO card|Overseas Indian|Look East|Act East|Neighbourhood First|multilateral forum|climate diplomacy"]),
 ("GS3","economy: macro / planning",
   [r"fiscal deficit|monetary policy|repo rate|reverse repo|inflation targeting|consumer price index|current account deficit|gross domestic product|capital expenditure|disinvestment|public debt|fiscal consolidation|GST exit|tax devolution|planning in India|economic survey"]),
 ("GS3","agriculture & food systems",
   [r"minimum support price|MSP procurement|agricultural subsidy|input subsidy|fertiliser subsidy|drip irrigation|canal irrigation|kharif crop|rabi crop|PDS|buffer stock|food processing|cold storage|supply chain|APMC|e-NAM|organic farming|contract farming|cropping pattern|institutional credit|agri-exports"]),
 ("GS3","land reforms / liberalisation / industry",
   [r"land reform|tenancy reform|land ceiling|bhoodan|land acquisition act|compensation|liberalisation of|economic reform 1991|New Industrial Policy|disinvestment|Make in India|production linked incentive|MSME sector|FDI policy|de-licensing"]),
 ("GS3","infrastructure / energy / investment",
   [r"renewable energy|solar park|wind farm|nuclear capacity|power grid|transmission line|railway network|dedicated freight corridor|port capacity|airport infrastructure|public private partnership|PPP model|investment model|infrastructure finance|NIIF"]),
 ("GS3","science & technology / innovation",
   [r"artificial intelligence|machine learning|quantum computing|nano-technology|biotech|gene editing|CRISPR|semiconductor|5G|6G|blockchain|robotics|cybersecurity|data protection act|intellectual property|patent regime|GIS mapping|material science|rare earth"]),
 ("GS3","space / defence indigenisation",
   [r"ISRO|Chandrayaan|Mangalyaan|Gaganyaan|Aditya-L1|cartosat|irnss|navic|satellite launch|antrix|Vikram Sarabhai|indigenous technolog|defence production|make in india defence|DRDO|Tejas|BrahMos"]),
 ("GS3","IPR",
   [r"patent law|patent examination|WIPO|TRIPS agreement|compulsory licensing|plant variety protection|geographical indication|GI tag|traditional knowledge|trade secret|copyright regime"]),
 ("GS3","environment / biodiversity / pollution",
   [r"climate change|greenhouse gas|global warming|IPCC|Paris Agreement|NDC|biodiversity hot spot|endangered species|wildlife protection act|forest cover|air quality index|pollution control board|EIA|environmental impact|wetland conservation|mangrove ecosystem|coral bleaching|blue economy"]),
 ("GS3","disaster management",
   [r"disaster management act|NDMA|SDRF|NDRF|disaster risk reduction|early warning system|Sendai Framework|cyclone preparedness|flood management|drought prone|landslide mitigation|heat wave action plan|National Disaster Response"]),
 ("GS3","internal security & extremism",
   [r"Left Wing Extremism|Naxal movement|insurgency in|terror financing|money laundering|hawala|cyber attack|internal security|security apparatus|Coast Guard|border security|intelligence agency|organised crime|illicit] drug trade|IMT Yadav|Operation Green Hunt"]),
 ("GS4","ethics & moral philosophy",
   [r"ethics in public|moral reasoning|virtue ethics|deontology|consequentialism|utilitarian|Kantian|categorical imperative|Aristotelian|Platonic ideal|moral dilemma|ethical dilemma|ethical governance|dimension of ethics"]),
 ("GS4","values / attitude / emotional intelligence",
   [r"foundational value|integrity in public|impartiality in administration|non-partisanship|objectivity|empathy in governance|tolerance|compassion for weaker|emotional intelligence|self.awareness|managing emotions|social influence|persuasion|attitudinal change|prejudice|stereotype"]),
 ("GS4","moral thinkers",
   [r"Chanakya\[s Neeti|Ramayana ethics|Gandhian values|Vivekananda|Swami Vivekananda|Socrates|Plato|Aristotle|Confucius|Bentham|John Rawls|Ambedkar ethics|Tolstoy|Stoic|Marcus Aurelius|Mill"]),
 ("GS4","public service ethics / probity / case studies",
   [r"code of conduct for civil|code of ethics|conflict of intere|whistle.alone|appointment to public office|corruption in public life|bribery|Lokpal and Lokayukta|probity in governance|work culture|quality of service delivery|utilization of public funds|case study|civil service values"]),
]

conn = psycopg2.connect(dbname=IH.PG_DB, user=IH.PG_USER,
                        password=IH.PG_PASS, host=IH.PG_HOST,
                        port=IH.PG_PORT)
cur = conn.cursor()

def count_docs(kws):
    pat = "|".join(kws)
    cur.execute("SELECT count(DISTINCT source_file) FROM upsc_chunks WHERE chunk ~* (%s)", (pat,))
    return cur.fetchone()[0]

def tier(n):
    if n == 0: return "NONE"
    if n == 1: return "1-doc"
    if n <= 3: return "thin"
    if n <= 8: return "OK"
    return "multi"

cur.execute("SELECT count(*) FROM upsc_chunks")
total = cur.fetchone()[0]

print(f"{'PAPER':5} {'SUBtopIC':46} {'docs':>5}  tier")
print("-" * 72)
by_paper = {}
for paper, sub, kws in SYLLABUS:
    n = count_docs(kws)
    t = tier(n)
    by_paper.setdefault(paper, []).append((sub, n, t))
    print(f"{paper:5} {sub:46} {n:>5}  {t}")
print("-" * 72)
print(f"total chunks: {total}")
for paper, rows in by_paper.items():
    weak = [s for s, n, t in rows if t in ("NONE", "1-doc", "thin")]
    ok = [s for s, n, t in rows if t in ("OK", "multi")]
    print(f"{paper}: robust={len(ok)}/{len(rows)} | weak: " + (", ".join(weak) if weak else "none"))