// Full diagnostic for the near-empty 1857 answer: was the loss in generation, the
// word-limit clamp, or grounding? Prints every stage plus the emitted text.
import { getMobileAnswer } from "/app/controllers/mobile.controller.js";
import { pool } from "/app/services/db.service.js";

const deviceId = "34fca381-3c03-9a98-01fa-2ecfd3ba9318";
const q = "Why did the Revolt of 1857 fail?";

const { buf } = await new Promise((resolve, reject) => {
  let buf = "";
  const res = {
    writeHead() { return res; }, write(c) { buf += c; return true; },
    end() { resolve({ buf }); return res; },
    status() { return res; }, json() { resolve({ buf }); return res; },
  };
  getMobileAnswer({ body: { deviceId, question: q, subject: "gs1", maxChunks: 4, maxContextChars: 10000, targetTokens: 1000 }, ip: "10.0.0.5", headers: {}, socket: { setNoDelay() {} } }, res).catch(reject);
});

let streamed = "", done = null;
for (const line of String(buf).split("\n")) {
  const t = line.trim();
  if (!t.startsWith("data: ")) continue;
  let d; try { d = JSON.parse(t.slice(6)); } catch { continue; }
  if (d.type === "token") streamed = d.text;
  if (d.type === "done") done = d;
}

const wc = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
console.log("streamed: chars=" + streamed.length + " words=" + wc(streamed) + " lines=" + streamed.split("\n").length);
console.log("done     : chars=" + (done?.answer?.length ?? 0) + " words=" + wc(done?.answer));
console.log("done meta: tokenCount=" + done?.tokenCount + " wordCount=" + done?.wordCount +
            " truncated=" + done?.truncated + " finishReason=" + done?.finishReason +
            " timedOut=" + done?.timedOut);
console.log("grounding: " + JSON.stringify(done?.grounding));

console.log("\n--- STREAMED (first 700) ---\n" + streamed.slice(0, 700));
console.log("\n--- DONE.ANSWER (full) ---\n" + done?.answer);
console.log("\n--- STREAMED (full) ---\n" + streamed);

await pool.end();