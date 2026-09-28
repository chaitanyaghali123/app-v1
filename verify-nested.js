const http = require("http");
const https = require("https");
const fs = require("fs");

const get = (u) =>
  new Promise((res, rej) => {
    const f = (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => res({ status: r.statusCode, headers: r.headers, body: d }));
    };
    const mod = u.startsWith("https") ? https : http;
    mod.get(u, f).on("error", rej);
  });

(async () => {
  // 1) nested bundle on disk
  const nested = "D:\\app-v1\\dist\\_expo\\static\\js\\web\\index-378fcd3a84688e11a8738f66f7a14581.js";
  try {
    const st = fs.statSync(nested);
    console.log("nested bundle on DISK: %d bytes  %s", st.size, fs.readFileSync(nested, "utf8").length);
  } catch (e) {
    console.log("nested bundle NOT on disk:", e.code);
  }

  // 2) fetch it over HTTP (served)
  const url = "http://localhost:3000/_expo/static/js/web/index-378fcd3a84688e11a8738f66f7a14581.js";
  let js = null;
  for (let i = 0; i < 8; i++) {
    const b = await get(url);
    if (b.status === 200 && b.body.length > 100000) { js = b; break; }
    await new Promise((z) => setTimeout(z, 600));
  }
  if (!js) {
    console.log("FAIL: couldn't fetch served nested bundle (last attempt above)");
    return;
  }
  console.log("served nested bundle: %d bytes", js.body.length);

  const s = js.body;
  const checks = {
    "full-screen page branch": "prelimsSubjectPage",
    "p1 subjects const": "PRELIMS_PAPER1_SUBJECTS",
    "p2 subjects const": "PRELIMS_PAPER2_SUBJECTS",
    "paper1 label GS": "UPSC Prelims Paper I - General Studies",
    "back button onPress": "setPrelimsSubjectPage(null)",
    "page card routes to page": "setPrelimsSubjectPage(paper.id)",
    "History subject": "History",
    "Geography subject": "Geography",
    "Polity subject": "Polity",
    "Economy subject": "Economy",
    "Environment subject": "Environment",
    "Reasoning subject(CSAT)": "Reasoning",
    "accordion gone (MISSING)": "setExpandedPrelims",
  };
  for (const [k, v] of Object.entries(checks)) {
    console.log("  %-34s => %s", k, s.includes(v) ? "PRESENT" : "absent");
  }
})();
