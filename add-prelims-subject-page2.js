const fs = require("fs");
const file = "D:\\app-v1\\mobile\\Dashboard.tsx";
let s = fs.readFileSync(file, "utf8");
const was = s;
const log = [];
let changed = falseIsolate;

// -------- 1) add prelimsSubjectPage state next to the other useStates --------
const stateAnchor = `  const [showApiInput] =`; // placeholder; replaced below if absent
if (!s.includes("setPrelimsSubjectPage")) {
  const anchor = `const [stats, setStats] = useState<CorpusStats | null>(null);`;
  const inject = anchor + `
  const [prelimsSubjectPage, setPrelimsSubjectPage] = useState<
    "prelim-gs1" | "prelim-csat" | null
  >(null);`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, inject);
    changedIsolate = s !== was;
  }
}
log.push("state " + (s.includes("setPrelimsSubjectPage") ? "OK" : "MISS"));

// -------- 2) Prelims card onPress -> open subject grid --------
if (s.includes("onPress={() => handlePressPaper(paper)}")) {
  // the Prelims map uses paper objects; wire them to the subject-page opener
  s = s.replace(
    "onPress={() => handlePressPaper(paper)}",
    "onPress={() => setPrelimsSubjectPage(paper.id === \"prelim-gs1\" ? \"prelim-gs1\" : \"prelim-csat\")}"
  );
  log.push("prelims-onPress " + (s.includes("setPrelimsSubjectPage(paper.id === ") ? "OK" : "MISS"));
}

// -------- 3) early-return subject page render branch --------
if (!s.includes("if (prelimsSubjectPage)")) {
  const branch = `
  if (prelimsSubjectPage) {
    const paper =
      prelimsSubjectPage === "prelim-gs1" ? PRELIMS_PAPERS[0] : PRELIMS_PAPERS[1];
    const subjects =
      prelimsSubjectPage === "prelim-gs1"
        ? PRELIMS_PAPER1_SUBJECTS
        : PRELIMS_PAPER2_SUBJECTS;
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.container}>
          <View style={styles.headerSection}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPrelimsSubjectPage(null)}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            >
              <Text style={styles.backBtnText}>\\u2190 Back</Text>
            </Pressable>
            <Text style={[styles.badge, { color: paper.color }]}>{paper.name}</Text>
            <Text style={styles.title}>Select a subject</Text>
            <Text style={styles.subtitle}>Choose a subject to load its question bank</Text>
          </View>

          <View style={styles.gsRow}>
            {subjects.map((subject) => (
              <Pressable
                key={subject.id}
                accessibilityRole="button"
                onPress={() => onSelectSubject(subject)}
                style={({ pressed }) => [
                  styles.gsCard,
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
  // anchor: end of the Dashboard function's error-guard block — insert before final return
  const anchor = `  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load: {error}</Text>
      </View>
    );
  }

`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, anchor + branch.replace(/\\\\u/g, "\\u"));
    log.push("branch " + (s.includes("if (prelimsSubjectPage)") ? "OK" : "MISS"));
  } else {
    log.push("branch MISS (anchor)");
  }
}

fs.writeFileSync(file, s, "utf8");
console.log(log.join(" | "));
console.log("changed:", s !== was);
