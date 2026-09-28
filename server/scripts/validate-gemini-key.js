/**
 * Validate a Gemini API key against the exact endpoints/models this app uses.
 *
 * Usage:
 *   node scripts/validate-gemini-key.js YOUR_API_KEY
 *   # or:
 *   GEMINI_KEY=... node scripts/validate-gemini-key.js
 *
 * Tests (mirrors live stack):
 *   1. generateContent (SSE streaming) on server/.env GEMINI_MODEL
 *   2. batchEmbedContents on vector_server/.env EMBED_MODEL / EMBED_DIM
 *
 * Exit codes: 0 = all pass, 1 = at least one check failed.
 */

const GENERATION_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const EMBED_MODEL = process.env.EMBED_MODEL || "gemini-embedding-2";
const EMBED_DIM = Number(process.env.EMBED_DIM || 3072);
const GENERATION_BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_BASE = "https://generativelanguage.googleapis.com/v1";

const key =
  process.argv[2] || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || "";

function truncate(text, max = 220) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

async function testGenerate(apiKey) {
  const url = `${GENERATION_BASE}/models/${GENERATION_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 20,
          thinkingConfig: { thinkingLevel: "minimal" },
        },
        systemInstruction: { parts: [{ text: "You are a test client." }] },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: resp.status, detail: truncate(text) };
    }
    const okMatch = /"text"\s*:\s*"[^"]*OK[^"]*"/i.test(text);
    return { ok: okMatch, status: resp.status, detail: truncate(text, 160) };
  } catch (err) {
    return { ok: false, status: "fetch-error", detail: truncate(String(err.message)) };
  }
}

async function testEmbed(apiKey) {
  const url = `${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: "test query" }] },
            taskType: "RETRIEVAL_QUERY",
            outputDimensionality: EMBED_DIM,
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: resp.status, detail: truncate(text) };
    }
    const hasValues = text.includes('"values"') && !text.includes('"error"');
    return { ok: hasValues, status: resp.status, detail: truncate(text, 160) };
  } catch (err) {
    return { ok: false, status: "fetch-error", detail: truncate(String(err.message)) };
  }
}

function classify(status, detail) {
  if (status === 401) return "KEY REJECTED — invalid/expired/revoked, or wrong endpoint for this key";
  if (status === 403) return "PERMISSION DENIED — key valid but lacks access to model/API";
  if (status === 429) return "RATE/QUOTA LIMITED — key valid but temp-limited";
  if (status === 404) return "MODEL NOT FOUND — key ok but model name wrong for this key's project";
  if (status === 400) return "BAD REQUEST — check payload/format";
  return "UNEXPECTED";
}

async function main() {
  if (!key) {
    console.error("No key provided. Usage: node scripts/validate-gemini-key.js YOUR_API_KEY");
    process.exit(2);
  }

  console.log(`Validating key ${key.slice(0, 6)}…${key.slice(-4)} (len=${key.length}, prefix=${key.slice(0, 4)})\n`);
  console.log(`  gen  : ${GENERATION_MODEL} @ ${GENERATION_BASE}\n  embed: ${EMBED_MODEL} (dim ${EMBED_DIM}) @ ${EMBED_BASE}\n`);

  const [gen, emb] = await Promise.all([testGenerate(key), testEmbed(key)]);

  console.log(`[generate] ${gen.ok ? "PASS" : "FAIL"} (status ${gen.status})`);
  if (!gen.ok) console.log(`    > ${classify(gen.status, gen.detail)}`);
  console.log(`    > ${gen.detail}\n`);

  console.log(`[embed]    ${emb.ok ? "PASS" : "FAIL"} (status ${emb.status})`);
  if (!emb.ok) console.log(`    > ${classify(emb.status, emb.detail)}`);
  console.log(`    > ${emb.detail}\n`);

  const allPass = gen.ok && emb.ok;
  console.log(allPass ? "RESULT: KEY GOOD ✓" : "RESULT: KEY BAD ✗");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Validator crashed:", err);
  process.exit(1);
});