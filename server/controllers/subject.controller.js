// GS Paper grouping for UPSC Mains
const GS_PAPERS = [
  {
    id: "gs1",
    name: "GS 1",
    description: "History, Art & Culture, Geography, Society",
    icon: "🏛️",
    color: "#f59e0b",
    subjects: [
      { id: "history", name: "History", icon: "📜", topics: ["Modern India", "World History", "Ancient India", "Medieval India"] },
      { id: "art-culture", name: "Art & Culture", icon: "🎭", topics: ["Indian Art", "Architecture", "Cultural Heritage"] },
      { id: "indian-society", name: "Indian Society", icon: "👥", topics: ["Social Structure", "Social Change", "Diversity"] },
      { id: "geography", name: "Geography", icon: "🌍", topics: ["Physical Geography", "Indian Geography", "Human Geography"] },
    ],
  },
  {
    id: "gs2",
    name: "GS 2",
    description: "Polity, Governance, Social Justice, IR",
    icon: "⚖️",
    color: "#3b82f6",
    subjects: [
      { id: "polity-governance", name: "Polity & Governance", icon: "⚖️", topics: ["Indian Constitution", "Political System", "Governance"] },
      { id: "constitution", name: "Constitution", icon: "📕", topics: ["Fundamental Rights", "DPSP", "Amendments"] },
      { id: "social-justice", name: "Social Justice", icon: "🤝", topics: ["Welfare Schemes", "Poverty", "Education", "Health"] },
      { id: "international-relations", name: "International Relations", icon: "🌐", topics: ["India & World", "Bilateral Relations", "Global Institutions"] },
    ],
  },
  {
    id: "gs3",
    name: "GS 3",
    description: "Economy, Environment, Security, S&T",
    icon: "🔬",
    color: "#10b981",
    subjects: [
      { id: "economy", name: "Indian Economy", icon: "💰", topics: ["Growth & Development", "Budget", "Agriculture", "Industry"] },
      { id: "environment", name: "Environment & Ecology", icon: "🌿", topics: ["Biodiversity", "Climate Change", "Conservation"] },
      { id: "disaster-management", name: "Disaster Management", icon: "🆘", topics: ["Natural Disasters", "Mitigation", "NDMA Guidelines"] },
      { id: "internal-security", name: "Internal Security", icon: "🛡️", topics: ["Cyber Security", "Terrorism", "Border Security"] },
      { id: "science-tech", name: "Science & Technology", icon: "🔬", topics: ["Space", "IT", "Biotechnology", "Nuclear"] },
    ],
  },
  {
    id: "gs4",
    name: "GS 4",
    description: "Ethics, Integrity & Aptitude",
    icon: "⭐",
    color: "#8b5cf6",
    subjects: [
      { id: "ethics", name: "Ethics & Integrity", icon: "⭐", topics: ["Ethics & Human Interface", "Attitude", "Aptitude", "Emotional Intelligence"] },
    ],
  },
  {
    id: "essay",
    name: "Essay",
    description: "Essay Writing & Current Affairs",
    icon: "📝",
    color: "#ec4899",
    subjects: [
      { id: "essay", name: "Essay Writing", icon: "📝", topics: ["Practice Essays", "Yojana", "Kurukshetra"] },
      { id: "current-affairs", name: "Current Affairs", icon: "📰", topics: ["Monthly Compilation", "Government Reports"] },
    ],
  },
  {
    id: "optional",
    name: "Optional",
    description: "Optional Subject Preparation",
    icon: "📚",
    color: "#6366f1",
    subjects: [
      { id: "optional", name: "Optional Subject", icon: "📚", topics: ["IGNOU Modules", "Elective Papers"] },
    ],
  },
];

// Flat list for API compatibility
const SUBJECTS = GS_PAPERS.flatMap((paper) =>
  paper.subjects.map((s) => ({
    ...s,
    gs_paper: paper.id,
    gs_paper_name: paper.name,
  }))
);

// GS paper lookup
const GS_PAPER_SUBJECTS = {};
for (const paper of GS_PAPERS) {
  GS_PAPER_SUBJECTS[paper.id] = paper.subjects.map((s) => s.id);
}

export function getSubjects(req, res) {
  return res.json({ subjects: SUBJECTS, gs_papers: GS_PAPERS });
}

export function getGsPapers(req, res) {
  return res.json({ gs_papers: GS_PAPERS });
}
