const fs = require("fs");
const path = "D:\\app-v1\\mobile\\Dashboard.tsx";
let s = fs.readFileSync(path, "utf8");
console.log("START bytes:", s.lengthnutz + "" , "");

const report = (ok, msg) => {
  console.log((ok ? "  [OK] " : "  [FAIL] ") + msg);
  return ok;
};

let problems = 0;

// ---------------- 1) Remove duplicate prelimsSubjectPage declaration ----------------
// If the state is declared twice (a TS/`const` redeclaration error) Metro's build
// silently fails -> stale bundle -> "still same". Keep exactly one.
const dupRe =
  /const \[prelimsSubjectPage, setPrelimsSubjectPage\] = useState<\s*\n\s*"prelims-p1" \| "prelims-p2" \| null\s*\n\s*>\(null\);\s*\n(?:\s*\n)*\s*const \[prelimsSubjectPage, setPrelimsSubjectPage\] = useState<\s*\n\s*"prelims-p1" \| "prelims-p2" \| null\s*\n\s*>\(null\);/g;
const cnt = (s.match(/const \[prelimsSubjectPage, setPrelimsSubjectPage\] = useState</g) || []).length;
console.log("  prelimsSubjectPage state declarations:", cnt);
if (cnt > 1) {
  s = s.replace(
    dupRe,
    `const [prelimsSubjectPage, setPrelimsSubjectPage] = useState<\n    "prelims-p1" | "prelims-p2" | null\n  >(null);`
  );
  report(s.match(/const \[prelimsSubjectPage, setPrelimsSubjectPage\] = useState</g).length === 1, "deduped prelimsSubjectPage state");
} else {
  report(true, "no duplicate state");
}

// ---------------- 2) Make the Prelims card open the subject page ----------------
const oldCardOnPress = `                  onPress={() =>
                    setExpandedPrelims(isExpanded ? null : paper.id)
                  }`;
const newCardOnPress = `                  onPress={() => setPrelimsSubjectPage(paper.id)}`;
if (s.includes(oldCardOnPress)) {
  s = s.replace(oldCardOnPress, newCardOnPress);
  report(true, "card onPress -> setPrelimsSubjectPage(paper.id)");
} else if (s.includes(newCardOnPress)) {
  report(true, "card already routes to setPrelimsSubjectPage");
} else {
  // looser: any setExpandedPrelims toggle in the prelims card
  const m = s.match(/onPress=\{\(\) =>\s*setExpandedPrelims\([^}]*\)\}/);
  if (m) {
    s = s.replace(m[0], "onPress={() => setPrelimsSubjectPage(paper.id)}");
    report(true, "card onPress (loose) -> setPrelimsSubjectPage");
  } else {
    report(false, "NO prelims-card onPress found — cannot route");
    problems++;
  }
}

// ---------------- 3) Insert full-screen subject page branch before main return ----------------
const anchor =
  "}\n\n  return (\n    <ScrollView";
const anchorIdx = s.lastIndexOf(anchor + "\n  if (");
if (anchorIdx < 0) {
  // find the error-guard block end then main return
  const guardStart = s.indexOf("if (error) {");
  if (guardStart < 0) { report(false, "error guard not found"); problems++; }
}

const pageBranch = `
  if (prelimsSubjectPage) {
    const paper =
      prelimsSubjectPage === "prelims-p1" ? PRELIMS_PAPERS[0] : PRELIMS_PAPERS[1];
    const subjects =
      prelimsSubjectPage === "prelims-p1"
        ? PRELIMS_PAPER1_SUBJECTS
        : PRELIMS_PAPER2_SUBJECTS;

    return (
      <View style={styles.container}>
        <View style={styles.pageHeader}>
          <View style={styles.pageBackCol}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to papers"
              onPress={() => setPrelimsSubjectPage(null)}
              style={({ pressed }) => [
                styles.pageBackBtn,
                { borderColor: paper.color + "30" },
                pressed && {
                  borderColor: paper.color,
                  backgroundColor: paper.color + "15",
                },
              ]}
            >
              <Text style={[styles.pageBackIcon, { color: paper.color }]}>
                {"\u2190"}
              </Text>
              <Text style={[styles.pageBackText, { color: paper.color }]}>
                Back
              </Text>
            </Pressable>
          </View>

          <View style={styles.pageTitleCol}>
            <Text style={styles.pageEyebrow}>UPSC PRELIMS</Text>
            <Text style={[styles.pageTitle, { color: paper.color }]}>
              {paper.name}
            </Text>
            <Text style={styles.pageSubtitle}>
              Select a subject to load its question bank
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.pageBody}>
            <Text style={styles.sectionLabel}>Subjects</Text>

            <View style={styles.gsRow}>
              {subjects.map((subject) => (
                <Pressable
                  key={subject.id}
                  accessibilityRole="button"
                  onPress={() => handlePressPrelimsSubject(subject)}
                  style={({ pressed }) => [
                    styles.gsCard,
                    { borderColor: subject.color + "30" },
                    pressed && {
                      borderColor: subject.color,
                      backgroundColor: subject.color + "08",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.gsIconWrap,
                      { backgroundColor: subject.color + "15" },
                    ]}
                  >
                    <Text style={styles.gsIcon}>{subject.icon}</Text>
                  </View>
                  <Text style={[styles.gsName, { color: subject.color }]}>
                    {subject.name}
                  </Text>
                  <Text style={[styles.gsChevron, { color: subject.color }]}>
                    {"\u203A"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

`;

// Insert pageBranch right before the main `return (\n    <ScrollView` of the final render.
const mainReturn = "  return (\n    <ScrollView";
const mrIdx = s.lastIndexOf(mainReturn);
if (mrIdx > 50) {
  s = s.slice(0, mrIdx) + pageBranch + s.slice(mrIdx);
  report(true, "inserted full-screen subject page branch");
} else {
  report(false, "main return not found for branch insertion");
  problems++;
}

// ---------------- 4) Add the page styles (pageHeader, pageBack*, pageTitle*) ----------------
const styleAnchor = "  scroll: {\n    flexGrow: 1,\n  },";
if (s.includes(styleAnchor)) {
  const addStyles = `  pageHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
    flexDirection: "row",
    gap: 14,
    paddingBottom: 18,
    paddingTop: 6,
  },
  pageBackCol: {
    alignItems: "flex-start",
  },
  pageBackBtn: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pageBackIcon: {
    fontSize: 18,
    fontWeight: "700",
  },
  pageBackText: {
    fontSize: 15,
    fontWeight: "700",
  },
  pageTitleCol: {
    flex: 1,
  },
  pageEyebrow: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  pageTitle: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
  },
  pageBody: {
    paddingTop: 20,
  },
  scroll: {
    flexGrow: 1,
  },`;
  s = s.replace(styleAnchor, addStyles);
  report(true, "added pageHeader/pageBack*/pageTitle* styles");
} else {
  report(false, "styles anchor not found");
  problems++;
}

fs.writeFileSync(path, s, "utf8");
console.log("WROTE bytes:", s.length, "| problems:", problems);

// ---------------- verify summary ----------------
const chk = s.match(/const \[prelimsSubjectPage, setPrelimsSubjectPage\] = useState</g) || [];
console.log("verify state decls:", chk.length);
console.log("verify page branch:", s.includes("if (prelimsSubjectPage) {"));
console.log("verify back button styles:", s.includes("pageBackBtn: {"));
