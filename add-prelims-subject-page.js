const fs = require("fs");
const file = "D:\\app-v1\\mobile\\Dashboard.tsx";
let s = fs.readFileSync(file, "utf8");
const was = s;
const out = [];
const rep = (ok, m) => out.push((ok ? "  [OK]  " : "  [MISS] ") + m);

// ---------- 1) subject arrays after PRELIMS_PAPERS ----------
const SUBJECTS_BLOCK = `
const PRELIMS_PAPER1_SUBJECTS = [
  { id: "history", name: "History", icon: "🏛️", color: "#b45309" },
  { id: "geography", name: "Geography", icon: "🌍", color: "#047857" },
  { id: "polity", name: "Polity", icon: "⚖️", color: "#1d4ed8" },
  { id: "economy", name: "Economy", icon: "💰", color: "#15803d" },
  { id: "environment", name: "Environment", icon: "🌿", color: "#065f46" },
  { id: "science-tech", name: "Science & Technology", icon: "🔬", color: "#6d28d9" },
  { id: "current-affairs", name: "Current Affairs", icon: "📰", color: "#be123c" },
];

const PRELIMS_PAPER2_SUBJECTS = [
  { id: "reading-comprehension", name: "Reading Comprehension", icon: "📖", color: "#1e40af" },
  { id: "reasoning", name: "Reasoning", icon: "🧠", color: "#7c3aed" },
  { id: "logical-analytical", name: "Logical / Analytical Ability", icon: "🧩", color: "#0891b2" },
  { id: "basic-maths", name: "Basic Maths / Numeracy", icon: "🔢", color: "#b45309" },
  { id: "data-interpretation", name: "Data Interpretation", icon: "📊", color: "#15803d" },
  { id: "decision-making", name: "Decision Making", icon: "⚖️", color: "#be123c" },
  { id: "communication", name: "Communication / Interpersonal", icon: "💬", color: "#0f766e" },
];
`;
if (!s.includes("PRELIMS_PAPER1_SUBJECTS")) {
  const anchor = `];\n\nexport default function Dashboard({`;
  // fallback anchor if export default wraps differently
  let done = s.replace(anchor, `];\n${SUBJECTS_BLOCK}\nexport default function Dashboard({`);
  if (done !== s) {
    s = done;
  } else {
    const m = s.match(/^.*const GS_PAPERS = \[/m);
    rep(!!m, "GS_PAPERS anchor for subject insert");
  }
}
rep(s.includes("PRELIMS_PAPER1_SUBJECTS") && s.includes("PRELIMS_PAPER2_SUBJECTS"), "subject arrays present");

// ---------- 2) prelimsSubjectPage state ----------
if (!s.includes("setPrelimsSubjectPage")) {
  const anchor = `const [stats, setStats] = useState<CorpusStats | null>(null);`;
  if (s.includes(anchor)) {
    s = s.replace(
      anchor,
      anchor + `\n  const [prelimsSubjectPage, setPrelimsSubjectPage] = useState<'prelim-gs1' | 'prelim-csat' | null>(null);`
    );
  }
}
rep(s.includes("setPrelimsSubjectPage"), "prelimsSubjectPage state present");

// ---------- 3) Prelims cards -> open subject grid ----------
// Prelims card onPress currently routes to handlePressPaper; rewire to open the grid
const cardChain =
  /onPress=\{\(\) => handlePressPaper\(paper\)\}/g;
// Only the FIRST occurrence controls PRELIMS_PAPERS.map (it's rendered before the GS row)
const first = cardChain.exec(s);
if (first) {
  const before = s.slice(0, first.index);
  const withinPrelims =
    before.split("PRELIMS_PAPERS.map").length > before.split("GS_PAPERS.map").length;
  if (withinPrelims && !s.includes("setPrelimsSubjectPage(paper.id)")) {
    s = s.replace(
      `/onPress={() => handlePressPaper(paper)}`,
      `onPress={() => setPrelimsSubjectPage(paper.id as 'prelim-gs1' | 'prelim-csat')}`
    );
  }
}
rep(s.includes("setPrelimsSubjectPage(paper.id"), "prelims card onPress -> open grid");

// ---------- 4) the subject-page render branch ----------
if (!s.includes("prelimsSubjectPage ? (")) {
  const branch = `
function PrelimsSubjectGrid({
  paper,
  subjects,
  onBack,
  onSelectSubject,
}: {
  paper: { id: string; name: string; icon: string };
  subjects: Array<{ id: string; name: string; icon: string; color: string }>;
  onBack: () => void;
  onSelectSubject: (subject: { id: string; name: string; icon: string; color?: string }) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.6 }]}>
            <Text style={styles.backLink}>← Back</Text>
          </Pressable>
          <Text style={[styles.badge, { color: paper.color || "#4f46e5" }]}>{paper.name}</Text>
          <Text style={styles.title}>Select a subject</Text>
          <Text style={styles.subtitle}>Choose a subject to load its question bank</Text>
        </View>
        <View style={styles.gsRow2Column}>
          {subjects.map((subject) => (
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
              <View style={[styles.gsIconWrap2, { backgroundColor: subject.color + "15" }]}>
                <Text style={styles.gsIcon2}>{subject.icon}</Text>
              </View>
              <Text style={[styles.gsName2, { color: subject.color }]}>{subject.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

`;
  const anchor = `const GS_PAPERS = [`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, branch + "\n\n" + anchor);
    s = s.replace("let s = 0;", "let s = 0; let s2 = s;"); // no-op guard
  }
}
rep(s.includes("function PrelimsSubjectGrid"), "subject-grid component present");

// ---------- 5) branch injection in return + data wiring ----------
if (!s.includes("prelimsSubjectPage ?")) {
  const returnAnchor = `  return (\n    <ScrollView contentContainerStyle={styles.scroll}>\n      <View style={styles.container}>`;
  if (s.includes(returnAnchor)) {
    const wire = `
  if (prelimsSubjectPage) {
    const paper =
      prelimsSubjectPage === "prelim-gs1"
        ? PRELIMS_PAPERS[0]
        : PRELIMS_PAPERS[1];
    const subjects =
      prelimsSubjectPage === "prelim-gs1"
        ? PRELIMS_PAPER1_SUBJECTS
        : PRELIMS_PAPER2_SUBJECTS;
    return (
      <PrelimsSubjectGrid
        paper={paper}
        subjects={subjects}
        onBack={() => setPrelimsSubjectPage(null)}
        onSelectSubject={(subject) => onSelectSubject({ id: subject.id, name: subject.name, icon: subject.icon })}
      />
    );
  }

`;
    s = s.replace(returnAnchor, wire + returnAnchor);
  }
}
rep(s.includes("prelimsSubjectPage ?"), "subject-page branch present");

fs.writeFileSync(file, s, "utf8");
console.log(out.join("\n"));
console.log("changed:", s !== was, "| bytes:", s.length);
