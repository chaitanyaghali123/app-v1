const fs = require("fs");
const { execSync } = require("child_process");

const path = "D:\\app-v1\\mobile\\Dashboard.tsx";
const out = "D:\\app-v1\\dist.web";
const markers = {
  "state decl": "const [prelimsSubjectPage, setPrelimsSubjectPage] = useState",
  "card full-screen nav": "setPrelimsSubjectPage(paper.id)",
  "page render guard": "if (prelimsSubjectPage) {",
  "back handler (main)": "setPrelimsSubjectPage(null)",
  "subjects render on page": "PRELIMS_SUBJECT_LIST",
  "back btn styles": "pageBackBtn:",
};

let s = fs.readFileSync(path, "utf8");
const problems = [];
const report = (ok, label) =>
  console.log((ok ? "  [OK] " : "  [FAIL] ") + label);

// ---------- 1) Ensure a place to render the full-screen page ----------
// We add an early-return branch right before the final render's return.
// Anchor:  the first "  return (" after the last guard "if (error)".
// But the file has TWO return blocks (loading/error guards + main). We want to
// add the page branch INSIDE the component body, i.e. only the MAIN return is
// affected, gated on prelimsSubjectPage.

// Strategy: locate the LAST occurrence of "  return (" in the file (the main one).
const lastRet = s.lastIndexOf("  return (");
if (lastRet < 0) {
  report(false, "main return not found");
  process.exit(1);
}

// Insert the page branch just before that main return, but AFTER the error guard.
// Simplest robust anchor: insert before "  return (\n    <ScrollView" if that's
// the last return; otherwise before the last "  return (".
const branch = `  if (prelimsSubjectPage) {
    const paper =
      prelimsSubjectPage === "prelims-p1" ? PRELIMS_PAPERS[0] : PRELIMS_PAPERS[1];
    const subjects =
      prelimsSubjectPage === "prelims-p1"
        ? PRELIMS_PAPER1_SUBJECTS
        : PRELIMS_PAPER2_SUBJECTS | null;
    if (!subjects) return null;

    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.container}>
          <View style={styles.pageHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to papers"
              onPress={() => setPrelimsSubjectPage(null)}
              style={({ pressed }) => [
                styles.pageBackBtn,
                { borderColor: paper.color + "30" },
                pressed && { borderColor: paper.color, backgroundColor: paper.color + "08" },
              ]}
            >
              <Text style={[styles.pageBackIcon, { color: paper.color }]}>\\u2039</Text>
              <Text style={[styles.pageBackText, { color: paper.color }]}>
                Back to Papers
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.pageTitle, { color: paper.color }]}>
            {paper.name}
          </Text>
          <Text style={styles.pageSubtitle}>
            Choose a subject — MCQs coming soon
          </Text>

          <View style={styles.gsRow}>
            {(subjects ?? []).map((subject) => (
              <View key={subject.id} style={styles.gsCol}>
                <Pressable
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
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

`;
s = s.slice(0, lastRet) + branch + s.slice(lastRet + s.slice(lastRet).indexOf("\n") + 1);
report(true, "inserted full-screen page branch before main return");

// ---------- 2) Rewire the Prelims card to the page, if not already ----------
const oldCardOnPress =
  "onPress={() =>\n                    setExpandedPrelims(isExpanded ? null : paper.id)\n                  }";
const looseRegex = /onPress=\{\(\) =>\s*setExpandedPrelims\([^}]*\)\}/;
if (s.includes(oldCardOnPress)) {
  s = s.replace(
    oldCardOnPress,
    "onPress={() => setPrelimsSubjectPage(paper.id)}"
  );
  report(true, "rewired card onPress -> setPrelimsSubjectPage");
} else if (s.includes("setPrelimsSubjectPage(paper.id)")) {
  report(true, "card already routes to setPrelimsSubjectPage");
} else if (looseRegex.test(s)) {
  s = s.replace(looseRegex, "onPress={() => setPrelimsSubjectPage(paper.id)}");
  report(true, "rewired card onPress (loose) -> setPrelimsSubjectPage");
} else {
  report(false, "card onPress NOT rewired");
  problems.push("onPress");
}

// ---------- 3) Ensure the state exists (self-heal) ----------
if (!s.includes("setPrelimsSubjectPage = useState")) {
  s = s.replace(
    /const \[expandedPrelims, setExpandedPrelims\] = useState<[\s\S]*?\n  >\(null\);\n/,
    `const [expandedPrelims, setExpandedPrelims] = useState<
    "prelims-p1" | "prelims-p2" | null
  >(null);
  const [prelimsSubjectPage, setPrelimsSubjectPage] = useState<
    "prelims-p1" | "prelims-p2" | null
  >(null);
`
  );
}
report(s.includes("setPrelimsSubjectPage = useState"), "prelimsSubjectPage state present");

// ---------- 4) Self-heal styles (pageBackBtn/pageBackIcon/...) ----------
for (const st of ["pageBackBtn", "pageBackIcon", "pageBackText", "pageTitle", "pageSubtitle"]) {
  if (!s.includes(st + ":")) {
    report(false, "missing style key: " + st);
    problems.push("style:" + st);
  }
}

fs.writeFileSync(path, s, "utf8");
console.log("WROTE bytes:", s.length, "| leftover problems:", problems.join(",") || "none");

// ---------- 5) Export web ----------
console.log("\\n=== expo export (web) ===");
try {
  const r = execSync("npx expo export --platform web --output-dir \"" + out + "\"", {
    cwd: "D:\\app-v1",
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  console.log(r.split("\\n").slice(-6).join("\\n"));
} catch (e) {
  console.log("export output:");console.log((e.stdout||"").split("\\n").slice(-12).join("\\n"));
  console.log((e.stderr||"").split("\\n").slice(-6).join("\\n"));
}

// ---------- 6) Verify the SERVED bundle (whatever :3000 actually serves) ----------
console.log("\\n=== served bundle verification ===");
const http = require("http");
function get(url) {
  return new Promise((res, rej) => {
    http
      .get(url, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res({ status: r.statusCode, body: d }));
      })
      .on("error", rej);
  });
}
(async () => {
  try {
    const home = await get("http://localhost:3000/");
    const m = /src="\/?(index-[0-9a-f]+\.js)"/.exec(home.body);
    const bundleName = m ? m[1] : "?";
    console.log("home len:", home.body.length, "| bundle:", bundleName);
    const js = await get("http://localhost:3000/" + bundleName);
    console.log("bundle status:", js.status, "len:", js.body.length);
    for (const [label, needle] of Object.entries(markers)) {
      if (needle === "PRELIMS_SUBJECT_LIST") needle = "PRELIMS_PAPER1_SUBJECTS";
      console.log("  " + label.padEnd(24) + (js.body.includes(needle) ? "=> PRESENT" : "=> MISSING"));
    }
    console.log("  accordion remnants (should be EMPTY):", /setExpandedPrelims/.test(js.body) ? "FOUND ❌" : "none ✓");
  } catch (e) {
    console.log("HTTP error:", e.message);
  }
})();
