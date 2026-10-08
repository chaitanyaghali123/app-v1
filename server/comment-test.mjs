// Does heading structure follow the question's own logic? Runs the "Comment" case
// from the requirement plus two other verbs, and reports the section sequence.
import { getMobileAnswer } from "/app/controllers/mobile.controller.js";
import { pool } from "/app/services/db.service.js";

const deviceId = "34fca381-3c03-9a98-01fa-2ecfd3ba9318";
const QUESTIONS = [
  { tag: "comment", q: "The model of planned economy was adopted in India to address the regional imbalances left behind by colonial rule. Comment." },
  { tag: "comment-2", q: "Green Revolution is said to have made India food-secure but at the cost of ecological damage. Comment." },
  { tag: "why", q: "Why did the Revolt of 1857 fail?" },
  { tag: "evaluate", q: "Evaluate the role of the Planning Commission in the industrialisation of India." },
];

for (const { tag, q } of QUESTIONS) {
  const { buf } = await new Promise((resolve, reject) => {
    let buf = "";
    const res = {
      writeHead() { return res; }, write(c) { buf += c; return true; },
      end() { resolve({ buf }); return res; },
      status() { return res; }, json() { resolve({ buf }); return res; },
    };
    getMobileAnswer({ body: { deviceId, question: q, subject: "gs3", maxChunks: 4, maxContextChars: 10000, targetTokens: 1000 }, ip: "10.0.0.5", headers: {}, socket: { setNoDelay() {} } }, res).catch(reject);
  });

  let text = "";
  for (const line of String(buf).split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data: ")) continue;
    let d; try { d = JSON.parse(t.slice(6)); } catch { continue; }
    if (d.type === "token") text = d.text;
  }

  const lines = text.split("\n");
  const heads = lines
    .filter((l) => /^\s*#{1,6}\s/.test(l))
    .map((l) => l.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim());

  console.log("\n=========== [" + tag + "] " + q.slice(0, 70));
  console.log("  words=" + text.trim().split(/\s+/).length + "  sections=" + heads.length);
  for (const h of heads) console.log("     " + h.slice(0, 76));
  const last = (heads[heads.length - 1] || "").toLowerCase();
  console.log("  first heading generic (intro)? " + /^(introduction|intro)$/.test(heads[0] || ""));
  console.log("  last heading named after verb? " + /(comment|conclusion|assessment|verdict)/.test(last));
}

await pool.end();