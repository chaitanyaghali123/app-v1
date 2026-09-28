const fs = require("fs");
const path = require("path");
const dir = "D:\\app-v1\\dist\\_expo\\static\\js\\web";
const f = path.join(dir, "index-3a2b857cd40170daea327d6981286064.js");

let s = "";
try { s = fs.readFileSync(f, "utf8"); } catch (e) { console.log("READ FAIL", e.message); process.exit(1); }

console.log("bundle:", path.basename(f), s.length, "bytes");
const absent = ["PRELIMS_PAPERS", "setPrelimsSubjectPage", "setExpandedPrelims", "SAFFRON", "COACHING APPLIED", "streak", "Paper I \u00b7 GS", "accordion"];
const present = ["RAG Study Assistant", "Choose a paper to start", "UPSC MAINS", "GS 1", "Optional"];
let ok = true;
for (const m of absent)  { const hit = s.includes(m); if (hit) ok = false; console.log("  ABSENT-src  " + (hit ? "!!FOUND-NOOP" : "absent-OK     ") + m); }
for (const m of present) { const hit = s.includes(m); if (!hit) ok = false; console.log("  PRESENT-src " + (hit ? "present-OK  " : "!!MISSING   ") + m); }
console.log(ok ? "RESULT: pre-5:43 UI served" : "RESULT: MISMATCH");
