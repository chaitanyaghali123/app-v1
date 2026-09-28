const fs = require("fs");
const path = require("path");
const file = "D:\\app-v1\\mobile\\Dashboard.tsx";
let s = fs.readFileSync(file, "utf8");
const was = s;

const has = (t) => s.includes(t);
const report = (ok, msg) => console.log((ok ? "  [OK]  " : "  [MISS]") + msg);

// guard: bail out silly if file isn't the dashboard
if (!has("RAG Study Assistant") && !has("RAG Study Assistant")) {
  console.log("FATAL: not the dashboard file, aborting");
  process.exit(1);
}

// ---------- 1) ensure Prelims subject consts exist ----------
const SUBJ1 = `const PRELIMS_PAPER1_SUBJECTS = [
  { id: "history", name: "History", icon: "🏛️", color: "#b45309" },
  { id: "geography", name: "Geography", icon: "🌍", color: "#047857" },
  { id: "polity", name: "Polity", icon: "⚖️", color: "#1d4ed8" },
  { id: "economy", name: "Economy", icon: "💰", color: "#15803d" },
  { id: "environment", name: "Environment", icon: "🌿", color: "#065f46" },
  { id: "science-tech", name: "Science & Technology", icon: "🔬", color: "#6d28d9" },
  { id: "current-affairs", name: "Current Affairs", icon: "📰", color: "#be123c" },
];`;

const SUBJ2 = `const PRELIMS_PAPER2_SUBJECTS = [
  { id: "reading-comprehension", name: "Reading Comprehension", icon: "📖", color: "#1e40af" },
  { id: "reasoning", name: "Reasoning", icon: "🧠", color: "#7c3aed" },
  { id: "logical-analytical", name: "Logical / Analytical Ability", icon: "🧩", color: "#0891b2" },
  { id: "basic-maths", name: "Basic Maths / Numeracy", icon: "🔢", color: "#b45309" },
  { id: "data-interpretation", name: "Data Interpretation", icon: "📊", color: "#15803d" },
  { id: "decision-making", name: "Decision Making", icon: "⚖️", color: "#be123c" },
  { id: "communication", name: "Communication / Interpersonal", icon: "💬", color: "#0f766e" },
];`;

// anchor: after the last PRELIMS_PAPERS closing bracket
if (!has("PRELIMS_PAPER1_SUBJECTS")) {
  const m = s.match(/(\n;\n\n)(export default function Dashboard)/);
  if (m) {
    s = s.replace(
      /\n;\n\n(export default function Dashboard)/,
      "\n;\n\n" + SUBJ1 + "\n\n" + SUBJ2 + "\n\n$1"
    );
  }
}
report(has("PRELIMS_PAPER1_SUBJECTS") && has("PRELIMS_PAPER2_SUBJECTS"), "Prelims subject consts present");

// ---------- 2) ensure prelimsSubjectPage state ----------
if (!has("setPrelimsSubjectPage")) {
  s = s.replace(
    /(const \[stats, setStats\] = useState<CorpusStats \| null>\(null\);)/,
    "$1\n  const [prelimsSubjectPage, setPrelimsSubjectPage] = useState<'prelim-gs1' | 'prelim-csat' | null>(null);"
  );
}
report(has("setPrelimsSubjectPage"), "prelimsSubjectPage state present");

// ---------- 3) rewire Prelims card onPress -> open subject page ----------
// Prelims cards map over PRELIMS_PAPERS; change their onPress to setPrelimsSubjectPage
const prelimsCardRe = /onPress=\{\(\) => handlePressPaper\(paper\)\}/g;
const prelimsSectionIdx = s.indexOf("PRELIMS_PAPERS.map");
if (prelimsSectionIdx !== -1) {
  const sectionHead = s.slice(prelimsSectionIdx, prelimsSectionIdx + 2400);
  const mapped = sectionHead.replace(
    /onPress=\{\(\) => handlePressPaper\(paper\)\}/g,
    "onPress={() => setPrelimsSubjectPage(paper.id as 'prelim-gs1' | 'prelim-csat')}"
  );
  s = s.slice(0, prelimsSectionIdx) + mapped + s.slice(prelimsSectionIdx + sectionHead.length);
  report(true, "Prelims card onPress -> setPrelimsSubjectPage");
} else {
  report(false, "PRELIMS_PAPERS.map found");
}

// ---------- 4) add the subject-page render branch, right before final return ----------
if (!has("prelimsSubjectPage ? (")) {
  const branch = `      if (prelimsSubjectPage) {
        const paper = prelimsSubjectPage === "prelim-gs1" ? PRELIMS_PAPERS[0] : PRELIMS_PAPERS[1];
        const subs =
          prelimsSubjectPage === "prelim-gs1" ? PRELIMS_PAPER1_SUBJECTS : PRELIMS_PAPER2_SUBJECTS;
        return (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.container}>
              <View style={styles.headerSection}>
                <Pressable onPress={() => setPrelimsSubjectPage(null)}>
                  <Text style={styles.backLink}>← Back</Text>
                </Pressable>
                <Text style={styles.badge}>{paper.name}</Text>
                <Text style={styles.title}>Select a subject</Text>
                <Text style={styles.subtitle}>Load its question bank</Text>
              </View>
              <View style={styles.gsRow2Column}>
                {subs.map((subject) => (
                  <Pressable
                    key={subject.id}
                    accessibilityRole="button"
                    onPress={() => onSelectSubject(subject)}
                    style={({ pressed }) => [
                      styles.gsCardRow,
                      { borderColor: subject.color + "30" },
                      pressed && { borderColor: subject.color, backgroundColor: subject.color + "08" },
                    ]}
                  >
                    <View style={[styles.gsIconWrap, { backgroundColor: subject.color + "15" }]}>
                      <Text style={styles.gsIcon}>{subject.icon}</Text>
                    </View>
                    <Text style={[styles.gsName, { color: subject.color }]}>{subject.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        );
      }

`;
  const anchor = "\n  return (\n    <ScrollView";
  s = s.replace(anchor, "\n" + branch + "  return (\n    <ScrollView");
}
report(has("prelimsSubjectPage ? ("), "subject-page render branch present");

// ---------- 5) add styles used by the branch ----------
if (!has("gsRow2Column:")) {
  s = s.replace(
    /  gsRow: \{/,
    `  gsRow2Column: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 28,
  },
  gsCardRow: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  backLink: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  gsRow: {`
  );
}
report(has("gsRow2Column:"), "branch styles present");

fs.writeFileSync(path.join("D:\\app-v1", "patched-" + Date.now() + ".txt"), was, "utf8");
fs.writeFileSync(file, s, "utf8");
console.log("DONE. bytes:", was.length, "->", s.length, "changed:", was !== s);
