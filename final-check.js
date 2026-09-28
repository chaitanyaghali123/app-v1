const http = require("http");

const get = (u) =>
  new Promise((res, rej) => {
    http
      .get(u, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res({ status: r.statusCode, body: d }));
      })
      .on("error", rej);
  });

(async () => {
  // 1) home -> extract EXACT script src (allow nested _expo/static/js/web/ paths, NOT just root)
  const home = await get("http://localhost:3000/");
  const m = /src="(\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js)"/.exec(home.body) ||
            /src="((?:[^"']*\/)?index-[0-9a-f]+\.js)"/.exec(home.body);
  const ref = m ? m[1] : null;
  console.log("served home script ref (nested-ok):", ref);

  if (!ref) {
    console.log("NO script ref found in served home; raw head:", JSON.stringify(home.body.slice(0, 300)));
    return;
  }

  // 2) fetch the EXACT nested path over HTTP with retry
  let b = null;
  for (let i = 0; i < 10 && !b; i++) {
    const r = await get("http://localhost:3000" + (ref.startsWith("/") ? ref : "/" + ref));
    if (r.status === 200 && r.body.length > 100000) b = r;
    else await new Promise((z) => setTimeout(z, 500));
  }
  if (!b) {
    console.log("FAIL: exact nested bundle not fetchable after retries");
    return;
  }
  console.log("=== EXACT SERVED BUNDLE: %d bytes (status %s) ===", b.body.length, b.status);

  const s = b.body;
  const checks = {
    "UPSC Prelims card row present": "UPSC Prelims",
    "card routes to page (nested bundle)": "setPrelimsSubjectPage(paper.id)",
    "subject page state": "prelimsSubjectPage",
    "subjects render wrapper": "prelimsSubjectPage", // reuse
    "BACK to papers": "setPrelimsSubjectPage(null)",
    "Paper 1 subjects const exists": "PRELIMS_PAPER1_SUBJECTS",
    "Paper 2 subjects const exists": "PRELIMS_PAPER2_SUBJECTS",
    "History": "History",
    "Geography": "Geography",
    "Polity": "Polity",
    "Economy": "Economy",
    "Environment": "Environment",
    "Science & Technology": "Science & Technology",
    "Current Affairs": "Current Affairs",
    "Comprehension": "Comprehension",
    "Reasoning": "Reasoning",
    "Numeracy": "Numeracy",
    "Interpersonal": "Interpersonal",
    "Data Interpretation": "Data Interpretation",
    "Decision Making": "Decision Making",
    "ACCORDION REMOVED (want absent)": "setExpandedPrelims",
    "OLD accordion onPress (want absent)": "setExpandedPrelims(isExpanded ? null : paper.id)",
  };
  for (const [k, v] of Object.entries(checks)) {
    console.log("  %-46s => %s", k, s.includes(v) ? "PRESENT" : "absent");
  }
  console.log("\nResolve answer: %s",
    s.includes("PRELIMS_PAPER1_SUBJECTS") &&
    s.includes("PRELIMS_PAPER2_SUBJECTS") &&
    s.includes("History") &&
    s.includes("Reasoning") &&
    !s.includes("setExpandedPrelims")
      ? "NEW PAGE FULLY SERVED ✓"
      : "STILL OLD/SERVED-DRIFT");
})();
