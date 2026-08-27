// GS Paper → folder mapping for ingestion queries
const GS_PAPER_FOLDER_MAP = {
  gs1: ["history", "culture", "heritage", "geography", "society", "indian-society", "art-culture"],
  gs2: ["polity", "governance", "constitution", "social-justice", "international", "international-relations"],
  gs3: ["economy", "economic", "environment", "ecology", "biodiversity", "disaster", "disaster-management", "security", "internal-security", "science", "technology", "science-tech", "agriculture"],
  gs4: ["ethics", "integrity"],
  essay: ["essay", "current", "current-affairs", "yojana", "kurukshetra"],
  optional: ["optional"],
};

const SUBJECT_FOLDER_MAP = {
  history: ["history"],
  "art-culture": ["heritage", "culture", "art"],
  geography: ["geography"],
  "polity-governance": ["polity", "governance"],
  constitution: ["constitution"],
  economy: ["economy", "economic"],
  environment: ["environment", "ecology", "biodiversity"],
  "science-tech": ["science", "technology"],
  "social-justice": ["social justice", "social_justice"],
  "international-relations": ["international", "international relations"],
  "disaster-management": ["disaster"],
  "internal-security": ["security"],
  ethics: ["ethics", "integrity"],
  agriculture: ["agriculture"],
  "indian-society": ["society"],
  "current-affairs": ["current"],
  essay: ["essay"],
  optional: ["optional"],
  gs1: GS_PAPER_FOLDER_MAP.gs1,
  gs2: GS_PAPER_FOLDER_MAP.gs2,
  gs3: GS_PAPER_FOLDER_MAP.gs3,
  gs4: GS_PAPER_FOLDER_MAP.gs4,
};

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function subjectNameWords(subject) {
  const raw = [
    String(subject || ""),
    ...(SUBJECT_FOLDER_MAP[subject] || []),
  ];
  const words = new Set();
  for (const part of raw) {
    for (const word of String(part)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)) {
      if (word.length > 2) words.add(word);
    }
  }
  return [...words];
}

export function correctSubjectTypo(question, subject) {
  const canonical = subjectNameWords(subject);
  if (canonical.length === 0) return null;
  const original = String(question || "");
  const corrected = original.replace(/[a-z0-9]{3,}/gi, (word) => {
    const lower = word.toLowerCase();
    let best = null;
    for (const c of canonical) {
      if (lower === c) return word;
      const d = levenshtein(lower, c);
      if (d > 0 && d <= 2 && (best === null || d < best.d)) {
        best = { c, d };
      }
    }
    return best ? best.c : word;
  });
  return corrected === original ? null : corrected;
}

export { SUBJECT_FOLDER_MAP, GS_PAPER_FOLDER_MAP };
