const SUBJECTS = [
  { id: "essay", name: "Essay", icon: "📝" },
  { id: "art-culture", name: "Indian Heritage & Culture", icon: "🎭" },
  { id: "history", name: "History", icon: "📜" },
  { id: "indian-society", name: "Indian Society", icon: "👥" },
  { id: "geography", name: "Geography", icon: "🌍" },
  { id: "polity-governance", name: "Indian Polity & Governance", icon: "⚖️" },
  { id: "constitution", name: "Constitution", icon: "📕" },
  { id: "social-justice", name: "Social Justice", icon: "🤝" },
  { id: "international-relations", name: "International Relations", icon: "🌐" },
  { id: "economy", name: "Indian Economy", icon: "💰" },
  { id: "agriculture", name: "Agriculture", icon: "🌾" },
  { id: "science-tech", name: "Science & Technology", icon: "🔬" },
  { id: "environment", name: "Environment & Ecology", icon: "🌿" },
  { id: "disaster-management", name: "Disaster Management", icon: "🆘" },
  { id: "internal-security", name: "Internal Security", icon: "🛡️" },
  { id: "ethics", name: "Ethics, Integrity & Aptitude", icon: "⭐" },
  { id: "current-affairs", name: "Current Affairs", icon: "📰" },
  { id: "optional", name: "Optional Subjects", icon: "📚" },
];

export function getSubjects(req, res) {
  return res.json({ subjects: SUBJECTS });
}
