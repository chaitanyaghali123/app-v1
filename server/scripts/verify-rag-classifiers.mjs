/**
 * Verification harness for the two pure RAG classifiers.
 *
 * Both decide answer shape or answer refusal *before* any model call, so a wrong
 * verdict is not a degraded answer - it is a silently wrong one. That makes them
 * worth testing directly instead of inferring their behaviour from endpoint runs,
 * which cost a generation each and could not isolate the cause of a failure.
 *
 *   node server/scripts/verify-rag-classifiers.mjs
 *
 * The endpoint-level checks that these unit checks cannot cover (does the planner
 * actually produce the intended dimensions, does the Conclusion survive the word
 * clamp) still need a live run, and must assert on `done.answer` rather than the
 * streamed token text - the raw stream is pre-post-processing and will show
 * defects the final answer does not have.
 */
import { shouldEnumeratePoints } from "../services/gemini.service.js";
import { deterministicScopeCheck } from "../controllers/mobile.controller.js";

const chunks = (...texts) => texts.map((text) => ({ text }));

const SCOPE_CASES = [
  {
    label: "region scope, single-country evidence -> refuse",
    question: "Water resources are both an asset and a source of conflict in South Asia. Examine.",
    chunks: chunks("India's water scarcity is severe. Rainwater harvesting helps."),
    want: false,
  },
  {
    label: "region scope, two members covered -> accept",
    question: "Water resources are both an asset and a source of conflict in South Asia. Examine.",
    chunks: chunks("India faces severe water scarcity.", "Pakistan's Indus basin is contested."),
    want: true,
  },
  {
    label: "region scope, three members covered -> accept",
    question: "Discuss water cooperation in South Asia.",
    chunks: chunks("India builds dams.", "Pakistan disputes flows.", "Bangladesh suffers floods."),
    want: true,
  },
  {
    label: "region scope, zero members covered -> refuse",
    question: "Discuss water cooperation in South Asia.",
    chunks: chunks("France has abundant water. Germany manages rivers well."),
    want: false,
  },
  {
    label: "region scope, one member among several -> refuse",
    question: "Discuss industrial policy in South Asia.",
    chunks: chunks("India liberalised in 1991. Japan grew rapidly. China industrialised fast."),
    want: false,
  },
  {
    label: "two regions named -> both must be covered",
    question: "Compare agricultural policy in South Asia and East Asia.",
    chunks: chunks("India and Pakistan both subsidise wheat.", "China and Japan protect rice farmers."),
    want: true,
  },
  {
    label: "two regions named, only first covered -> refuse",
    question: "Compare agricultural policy in South Asia and East Asia.",
    chunks: chunks("India and Pakistan both subsidise wheat."),
    want: false,
  },
  {
    label: "country scope, country absent -> refuse",
    question: "Assess the impact of Nepal's land reform on rural incomes.",
    chunks: chunks("India's green revolution relied on land reform."),
    want: false,
  },
  {
    label: "country scope, country present -> accept",
    question: "Assess the impact of Nepal's land reform on rural incomes.",
    chunks: chunks("Nepal's land reform redistributed holdings."),
    want: true,
  },
  {
    label: "two countries named -> both must be covered",
    question: "Analyse India-Pakistan relations over water.",
    chunks: chunks("India built the dam.", "Pakistan opposed it."),
    want: true,
  },
  {
    label: "two countries named, only first covered -> refuse",
    question: "Analyse India-Pakistan relations over water.",
    chunks: chunks("India built the dam on the Ravi."),
    want: false,
  },
  {
    label: "region + country, region short of members even though country present -> refuse",
    question: "Compare federalism in South Asia and India.",
    chunks: chunks("India's federal structure is unitary in practice."),
    want: false,
  },
  {
    label: "region + country, both independently satisfied -> accept",
    question: "Compare federalism in South Asia and India.",
    chunks: chunks("India is nominally federal.", "Pakistan is a federation.", "Bangladesh is unitary."),
    want: true,
  },
  {
    label: "'Southeast Asia' is not also read as 'East Asia'",
    question: "Compare industrial policy in Southeast Asia and India.",
    chunks: chunks("India liberalised in 1991.", "Myanmar opened its economy.", "Thailand industrialised fast."),
    want: true,
  },
  {
    label: "two scopes, neither covered -> multi-scope message names both",
    question: "Compare federalism in South Asia and India.",
    chunks: chunks("France is a unitary state. Germany is federal."),
    want: false,
    issue: "Add source material covering south asia and india",
    showIssue: true,
  },
  {
    label: "region with zero members covered -> no 'none of the region' copy",
    question: "Compare federalism in South Asia and East Asia.",
    chunks: chunks("India is nominally federal. Pakistan is a federation."),
    want: false,
    issue: "the retrieved notes do not cover it at all",
    showIssue: true,
  },
  {
    label: "two scopes unmet, one satisfied -> message names both missing and the one held",
    question: "Compare federalism in South Asia, East Asia and India.",
    chunks: chunks("India is nominally federal."),
    want: false,
    issue: "but the retrieved notes cover only india",
    showIssue: true,
  },
  {
    label: "single missing region keeps the single-scope wording",
    question: "Water resources are both an asset and a source of conflict in South Asia. Examine.",
    chunks: chunks("India's water scarcity is severe."),
    want: false,
    issue: "quietly answer about india instead of south asia",
  },
  {
    label: "no geographic scope -> accept",
    question: "Discuss the salient features of the Green Revolution.",
    chunks: chunks("High-yielding seeds raised yields."),
    want: true,
  },
];

const PLANNER_CASES = [
  ["What were the events that led to the Quit India Movement? Point out its results.", true, "two dimensions, two sentences, no conjunction"],
  ["Discuss the causes and consequences of the Quit India Movement.", true, "conjunction form"],
  ["Analyse the causes and consequences of the 1857 revolt.", true, "analys + two nouns"],
  ["Enumerate the merits and demerits of the licensing policy.", true, "explicit enumeration"],
  ["Enumerate the characteristics of the Indus Valley civilisation.", true, "explicit command beats pureFeatures"],
  ["List the features of the Indian Parliament.", true, "explicit command beats pureFeatures"],
  ["Outline the steps involved in resolving a financial crisis.", true, "outline"],
  ["Point out the factors that led to the decline of the Mughal Empire.", true, "point out"],
  ["Bring out the characteristics of the Indian federal system.", true, "bring out"],
  ["Trace the emergence of the NEP to contemporary debates.", true, "trace"],
  ["Explain the factors responsible for India's demographic transition.", true, "explain the factors"],
  ["Examine the role of the judiciary in sustaining democracy.", true, "plain examine"],
  ["What is the significance of the Fifth Schedule for tribal governance?", true, "significance form"],
  ["Discuss the salient features of Harappan architecture.", false, "pure feature list stays prose"],
  ["What are the salient features of the Green Revolution?", false, "pure feature list stays prose"],
  ["What are the characteristics of the Neolithic site of Mehrgarh?", false, "pure characteristic list stays prose"],
  ['"The tragedy of the commons." Elucidate.', false, "elucidate stays prose"],
  ["Critically examine the role of the Supreme Court in federalism.", false, "critically examine stays prose"],
  ["To what extent did the Emergency alter the political order?", false, "to what extent stays prose"],
  ["Comment on the functioning of Indian federalism.", false, "comment stays prose"],
];

let failures = 0;
const report = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
};

console.log("== deterministicScopeCheck ==");
for (const c of SCOPE_CASES) {
  const got = deterministicScopeCheck(c.question, c.chunks);
  const ok = got.ok === c.want;
  // An untested message branch is how bad user-facing text ships, so the refusal
  // copy is asserted wherever a case names what it should say.
  const copyOk = !c.issue ? true : (got.issue || "").includes(c.issue);
  report(ok && copyOk, `${String(got.ok).padEnd(5)} (want ${c.want})  ${c.label}${ok && !copyOk ? "  <- message missing: " + c.issue : ""}`);
  if (!got.ok && c.showIssue) console.log(`        issue: ${got.issue}`);
}

console.log("\n== shouldEnumeratePoints ==");
for (const [q, want, why] of PLANNER_CASES) {
  const got = shouldEnumeratePoints(q);
  report(got === want, `${got ? "enumerate" : "prose    "} (want ${want ? "enumerate" : "prose"})  ${why}  |  ${q.slice(0, 58)}`);
}

const total = SCOPE_CASES.length + PLANNER_CASES.length;
console.log(`\n${total - failures}/${total} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);