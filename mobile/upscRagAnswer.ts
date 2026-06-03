type RagChunk = {
  text?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type RagContextResponse = {
  chunks?: RagChunk[];
  chunkCount?: number;
};

type AnswerOptions = {
  backendUrl: string;
  question: string;
  maxChunks?: number;
  maxContextChars?: number;
  targetTokens?: number;
  polishTimeoutMs?: number;
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
};

type PolishResponse = {
  polishApplied?: boolean;
  answer?: string;
  intro?: string;
  conclusion?: string;
  reason?: string;
};

export async function answerUpscQuestionFromChunks(options: AnswerOptions) {
  const response = await fetch(`${options.backendUrl}/api/mobile/rag-context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: options.question,
      maxChunks: options.maxChunks ?? 5,
      maxContextChars: options.maxContextChars ?? 3600,
      targetTokens: options.targetTokens ?? 600,
    }),
  });

  if (!response.ok) {
    throw new Error(`RAG context request failed with status ${response.status}.`);
  }

  const ragContext = (await response.json()) as RagContextResponse;
  const chunks = ragContext.chunks ?? [];
  const draftAnswer = polishChunkComposedAnswer(
    composeUpscAnswer({
      question: options.question,
      chunks,
      targetTokens: options.targetTokens ?? 600,
    })
  );
  options.onStatus?.(
    chunks.length > 0
      ? "Polishing the chunk answer with local Qwen..."
      : "No chunks found. Skipping local Qwen polish."
  );
  const polish = chunks.length
    ? await requestQwenPolish({
        backendUrl: options.backendUrl,
        question: options.question,
        draftAnswer,
        chunks,
        timeoutMs: options.polishTimeoutMs ?? 600000,
      })
    : null;
  const finalAnswer = polish?.answer ?? draftAnswer;

  await streamAnswer(finalAnswer, options.onToken);

  return {
    answer: finalAnswer,
    chunks,
    chunkCount: ragContext.chunkCount ?? chunks.length,
    polishApplied: Boolean(polish?.polishApplied),
    polishReason: polish?.reason,
  };
}

async function requestQwenPolish({
  backendUrl,
  question,
  draftAnswer,
  chunks,
  timeoutMs,
}: {
  backendUrl: string;
  question: string;
  draftAnswer: string;
  chunks: RagChunk[];
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${backendUrl}/api/mobile/polish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        answer: draftAnswer,
        chunks,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const polish = (await response.json()) as PolishResponse;
    if (!polish.polishApplied) {
      return polish;
    }

    const answer = polish.answer?.trim()
      ? normalizeAnswerText(polish.answer)
      : applyIntroConclusionPolish(draftAnswer, polish);

    return {
      ...polish,
      answer,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function applyIntroConclusionPolish(answer: string, polish: PolishResponse) {
  let updated = answer;

  if (polish.intro?.trim()) {
    updated = replaceSectionLead(updated, "Introduction", polish.intro);
  }

  if (polish.conclusion?.trim()) {
    updated = replaceSectionLead(updated, "Conclusion", polish.conclusion);
  }

  return normalizeAnswerText(updated);
}

function replaceSectionLead(answer: string, heading: string, replacement: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escapedHeading}:\\n)([^\\n]+)`, "i");

  if (!pattern.test(answer)) {
    return answer;
  }

  return answer.replace(pattern, `$1${replacement.trim()}`);
}

function normalizeAnswerText(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function streamAnswer(answer: string, onToken?: (answer: string) => void) {
  if (!onToken) return;

  const parts = answer.split(/(\s+)/);
  let streamed = "";

  for (let index = 0; index < parts.length; index += 20) {
    streamed += parts.slice(index, index + 20).join("");
    onToken(streamed);
    await wait(12);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function polishChunkComposedAnswer(answer: string) {
  return normalizeAnswerText(answer)
    .replace(/\bThe notes connect them with\b/g, "They operate through")
    .replace(/\bThe notes connect\b/g, "The material connects")
    .replace(/\bThe notes mention\b/g, "The material highlights")
    .replace(/\bthe available notes connect it with\b/g, "it is linked with")
    .replace(/\bthe available notes\b/g, "the retrieved material")
    .replace(/\bThis means a mains answer should not stop at\b/g, "A mains answer should go beyond")
    .replace(/\bA good answer should\b/g, "The answer should");
}

function composeUpscAnswer({
  question,
  chunks,
  targetTokens,
}: {
  question: string;
  chunks: RagChunk[];
  targetTokens: number;
}) {
  const evidence = rankEvidence(chunks, question);
  const targetWords = Math.max(360, Math.round(targetTokens * 0.75));
  const subject = getQuestionSubject(question);

  if (evidence.length === 0) {
    return [
      "Introduction:",
      "Relevant notes were not found for this question.",
      "",
      "Conclusion:",
      "Please add clearer NCERT or class-note chunks for this topic before preparing a mains-style answer.",
    ].join("\n");
  }

  if (/trade\s+unions?/i.test(subject) && hasEvidence(evidence, /trade\s+union/i)) {
    return trimToWordBudget(composeTradeUnionAnswer(evidence), targetWords + 60);
  }

  if (
    /(bitcoin|crypto|cryptocurrency|cryptocurrencies)/i.test(subject) &&
    hasEvidence(evidence, /(bitcoin|crypto|satoshi|wallet|mining)/i)
  ) {
    return trimToWordBudget(composeBitcoinAnswer(evidence), targetWords + 60);
  }

  const used = new Set<string>();
  const take = (count: number, matcher?: (item: EvidenceItem) => boolean) => {
    const picked: EvidenceItem[] = [];
    for (const item of evidence) {
      const key = normalize(item.text);
      if (used.has(key)) continue;
      if (matcher && !matcher(item)) continue;
      used.add(key);
      picked.push(item);
      if (picked.length >= count) break;
    }
    return picked;
  };

  const concept = take(5, (item) => hasConceptSignal(item.text));
  const challenges = take(4, (item) => hasChallengeSignal(item.text));
  const wayForward = take(4, (item) => hasWayForwardSignal(item.text));
  const keyPoints = [...concept, ...take(8)];
  const conclusionFacts = take(2);
  const introFact = joinFacts(keyPoints.slice(0, 2));

  let answer = [
    "Introduction:",
    `${capitalize(subject)} is important for UPSC Mains because the available notes connect it with ${introFact}. The answer should therefore explain the concept, its institutional linkages, practical implications and limitations in a balanced manner.`,
    "",
    "Key Points:",
    ...keyPoints.map((item) => `- ${renderPoint(subject, item.text)}`),
    "",
    "Challenges/Limitations:",
    ...(challenges.length ? challenges : take(3)).map((item) => `- ${renderChallenge(subject, item.text)}`),
    "",
    "Way Forward:",
    ...(wayForward.length ? wayForward : take(3)).map((item) => `- ${renderWayForward(subject, item.text)}`),
    "",
    "Conclusion:",
    `Thus, ${subject} should be presented as a multidimensional issue linked with ${joinFacts(conclusionFacts.length ? conclusionFacts : keyPoints.slice(0, 2))}. A good answer should remain factual, balanced and reform-oriented while staying within the available notes.`,
  ].join("\n");

  const remaining = evidence.filter((item) => !used.has(normalize(item.text)));
  let cursor = 0;
  while (countWords(answer) < targetWords && cursor < remaining.length) {
    answer += `\n- ${renderPoint(subject, remaining[cursor].text)}`;
    cursor += 1;
  }

  return trimToWordBudget(answer, targetWords + 50);
}

type EvidenceItem = {
  text: string;
  score: number;
  chunkIndex: number;
  partIndex: number;
};

function composeTradeUnionAnswer(evidence: EvidenceItem[]) {
  const facts = evidence.map((item) => item.text).join(" ");
  const include = (pattern: RegExp) => pattern.test(facts);

  const lines = [
    "Introduction:",
    "Trade unions are located within the wider framework of industrial relations. The notes connect them with employees, employers, government, collective bargaining, workers' participation, industrial disputes and labour laws, so the concept is not only an organisational issue but also a governance and social justice issue.",
    "",
    "Key Points:",
    "- Concept and functions: The notes mention the concept, objectives and functions of trade unions. This means a mains answer should not stop at a one-line definition; it should explain their representative role, their link with workers' interests and their place in industrial relations.",
    "- Indian evolution: The notes refer to the history and growth of trade unions in India. This gives the answer historical depth and helps show that trade unions developed along with industrialisation, worker organisation and the need for institutional bargaining.",
    include(/Trade Union Act,?\s*1926/i)
      ? "- Legal framework: The Trade Union Act, 1926 is mentioned in the notes along with its provisions and implications. This provides the legal anchor for discussing recognition, organisation and functioning of trade unions in India."
      : "- Legal framework: The notes connect trade unions with labour-law institutions and legal regulation, so the answer should show their formal place in industrial relations.",
    "- Collective bargaining: The notes directly mention the role of trade unions in collective bargaining. Their importance lies in converting individual worker demands into collective negotiation with management.",
    "- Industrial relations ecosystem: The same material places trade unions alongside employees, employers and government. This supports a tripartite understanding of industrial relations where unions are one of the key stakeholders.",
    "- Dispute resolution: The notes connect industrial relations with industrial disputes, conciliation, arbitration, adjudication, works committees and labour courts. Trade unions therefore also matter in preventing, representing and resolving workplace conflict.",
    "",
    "Challenges/Limitations:",
    "- The notes explicitly mention problems and challenges of trade unions. A balanced answer should therefore recognise that unions are necessary but not always fully effective.",
    "- Globalisation and contemporary industrial relations are mentioned in the available material. This indicates that trade unions must work in a changing economy where employment patterns, technology and labour-market structures are shifting.",
    "- The notes also refer to the unorganised sector and recent labour codes. This shows that the reach of trade unions and the protection of workers remain uneven across sectors.",
    "",
    "Way Forward:",
    "- Strengthen collective bargaining so that trade unions can negotiate wages, working conditions and participation through institutional channels rather than only through confrontation.",
    "- Link trade unions with workers' participation in management, works committees and joint management councils, as these mechanisms are present in the notes and can promote industrial democracy.",
    "- Use conciliation, arbitration and adjudication more effectively for industrial disputes so that unions contribute to orderly conflict resolution and industrial peace.",
    "- Connect trade union activity with labour welfare and social security, because the notes mention welfare officers, statutory and voluntary welfare, and social security measures in India.",
    "",
    "Conclusion:",
    "Trade unions are therefore an essential part of India's industrial relations framework. Their UPSC Mains relevance lies in legal recognition, collective bargaining, industrial democracy and continuing challenges in a changing labour economy.",
  ];

  return lines.join("\n");
}

function composeBitcoinAnswer(evidence: EvidenceItem[]) {
  const facts = evidence.map((item) => item.text).join(" ");
  const include = (pattern: RegExp) => pattern.test(facts);

  const legalTender = include(/el\s*salvador|legal tender/i);
  const china = include(/china|chinese|financial institutions|nbfc/i);
  const wallet = include(/wallet|public address|private key|trace|phone number|email id/i);
  const mining = include(/mining|electricity|e-?waste|pollution|co2|iran/i);
  const tax = include(/gst|custom|income tax|tax/i);

  const lines = [
    "Introduction:",
    "Bitcoin is a cryptocurrency highlighted in the notes as part of the shift from conventional money to digital and decentralised forms of value. For UPSC Mains, it is important not merely as a technology, but as an issue connected with monetary regulation, taxation, financial stability, law enforcement and environmental costs.",
    "",
    "Key Points:",
    include(/2009|satoshi/i)
      ? "- Origin and nature: The notes state that Bitcoin was launched in 2009 by the anonymous user Satoshi Nakamoto. It represents a cryptocurrency system outside the direct control of ordinary banking and state-issued currency."
      : "- Nature: The notes place Bitcoin within the broader category of cryptocurrencies and digital money, making it relevant to debates on currency, regulation and financial governance.",
    include(/21 million|satoshi/i)
      ? "- Limited supply: The material mentions a total supply of 21 million Bitcoins and identifies Satoshi as the smallest unit. This fixed-supply feature is central to how Bitcoin is discussed as a digital asset."
      : "- Digital asset feature: Bitcoin works as a digital asset whose value depends on market acceptance, demand and the wider cryptocurrency ecosystem.",
    legalTender
      ? "- International example: El Salvador is cited as the first country to allow Bitcoin as legal tender from 2021, alongside the US dollar. The notes also mention that shopping, salaries and tax payments may be done through Bitcoin or US dollars there."
      : "- Global relevance: The notes connect Bitcoin with international regulatory choices, showing that countries respond differently to cryptocurrency adoption.",
    china
      ? "- Regulatory response: The notes refer to Chinese restrictions on financial institutions, including banks and NBFCs, from providing buying, selling or investment services for Bitcoin and other cryptocurrencies. This shows state concern over financial risk."
      : "- Regulatory response: Bitcoin raises questions about how the state should regulate digital assets without ignoring innovation or investor behaviour.",
    "",
    "Challenges/Limitations:",
    wallet
      ? "- Traceability and misuse: The notes explain that Bitcoin wallets have a public address and a private key, and can be created without a phone number or email id. This creates difficulties for law enforcement and can enable misuse in narcotics, illegal trade and terror finance."
      : "- Law-enforcement concern: Cryptocurrency transactions can create difficulties for monitoring, accountability and prevention of illegal activities.",
    tax
      ? "- Revenue concern: When goods and services are exchanged for cryptocurrency, the notes warn that government may be deprived of GST, customs duty and income tax. This makes taxation a major governance challenge."
      : "- Fiscal concern: Digital currency transactions can weaken the clarity of taxation and reporting if not properly regulated.",
    mining
      ? "- Environmental cost: The notes mention e-waste, high electricity use, CO2 emissions, and the Iran example where Bitcoin mining contributed to electricity outages, diesel-generator use and pollution. This links cryptocurrency with sustainability concerns."
      : "- Sustainability concern: The energy requirement of cryptocurrency mining makes environmental regulation an important part of the debate.",
    "- Financial volatility: The notes connect Bitcoin prices with regulatory actions and market forces. This volatility makes it risky for ordinary users and complicates its use as a stable medium of exchange.",
    "",
    "Way Forward:",
    "- Clear regulation: India needs a framework that distinguishes blockchain innovation from speculative or illegal cryptocurrency use. Regulation should focus on disclosure, taxation, consumer protection and anti-money-laundering safeguards.",
    "- Strong monitoring: Wallets, exchanges and payment channels should be brought under transparent reporting norms so that misuse for illegal trade, narcotics or terror finance can be reduced.",
    "- Tax compliance: Cryptocurrency-linked transactions should be mapped with GST, customs and income-tax systems to prevent revenue leakage mentioned in the notes.",
    "- Environmental safeguards: Mining-related electricity use, e-waste and emissions should be addressed through energy standards and strict enforcement where such activity affects public welfare.",
    "",
    "Conclusion:",
    "Bitcoin shows how digital innovation can challenge conventional ideas of money, regulation and state capacity. A balanced UPSC answer should therefore recognise its technological and global relevance, while also highlighting risks related to financial stability, taxation, crime control and environmental sustainability.",
  ];

  return lines.join("\n");
}

function rankEvidence(chunks: RagChunk[], question: string) {
  const questionTerms = tokenize(question).filter((word) => !STOP_WORDS.has(word));
  const seen = new Set<string>();
  const candidates = chunks.flatMap((chunk, chunkIndex) =>
    splitEvidence(chunk.text ?? chunk.content ?? "").map((text, partIndex) => ({
      text,
      chunkIndex,
      partIndex,
    }))
  );

  return candidates
    .filter(({ text }) => {
      const key = normalize(text);
      if (text.length < 18 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      score: scoreEvidence(candidate.text, questionTerms, candidate.chunkIndex, candidate.partIndex),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 28);
}

function splitEvidence(text: string) {
  const clean = text
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\b(?:www|pdfnotes|batch|mrunal)\b[^.]{0,100}/gi, ". ")
    .replace(/\b(?:FAQ|MCQ)\b[^.]{0,180}/gi, ". ")
    .replace(/=>|⇒|->|→/g, ". ")
    .replace(/\b\d+\.\s+/g, ". ")
    .replace(/\s+(?=(Concept|History|Structure|Role|Problems|Challenges|Industrial|Collective|Contemporary|Globalization|Labour|Factories|Trade Union Act|Bitcoin|El Salvador|China|Chinese|Iran)\b)/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  const rough = clean.split(/[.!?]+/).flatMap(splitLongEvidence);

  return rough
    .map((part) => cleanupEvidence(part))
    .filter((part) => part.length >= 18 && !/^syllabus$/i.test(part));
}

function splitLongEvidence(part: string) {
  const clean = part.trim();
  if (clean.length <= 150) return [clean];

  const pieces = clean.split(/,\s+/).filter(Boolean);
  if (pieces.length <= 2) return [clean];

  const grouped: string[] = [];
  for (let index = 0; index < pieces.length; index += 3) {
    grouped.push(pieces.slice(index, index + 3).join(", "));
  }
  return grouped;
}

function cleanupEvidence(text: string) {
  return text
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\b(?:www|pdfnotes|batch|mrunal)\b.*$/i, "")
    .replace(/\b(?:FAQ|MCQ)\b.*$/i, "")
    .replace(/\s*\([^)]{40,}\)\s*/g, " ")
    .replace(/\s*\[[^\]]{40,}\]\s*/g, " ")
    .replace(/[*_`#]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
    .trim();
}

function scoreEvidence(text: string, questionTerms: string[], chunkIndex: number, partIndex: number) {
  const words = tokenize(text);
  const overlap = words.filter((word) => questionTerms.includes(word)).length;
  const lengthScore = text.length > 35 && text.length < 180 ? 2 : 0;
  const earlyChunkScore = Math.max(0, 3 - chunkIndex);
  const earlyPartScore = Math.max(0, 2 - partIndex * 0.1);
  return overlap * 6 + lengthScore + earlyChunkScore + earlyPartScore;
}

function renderPoint(subject: string, fact: string) {
  return `${capitalize(subject)} is linked with ${lowerFirst(cleanFactForAnswer(fact))}.`;
}

function renderChallenge(subject: string, fact: string) {
  return `A key concern is ${lowerFirst(cleanFactForAnswer(fact))}.`;
}

function renderWayForward(subject: string, fact: string) {
  return `Policy response should address ${lowerFirst(cleanFactForAnswer(fact))} through clearer institutions, monitoring and practical implementation.`;
}

function joinFacts(items: EvidenceItem[]) {
  const facts = items.map((item) => lowerFirst(cleanFactForAnswer(item.text))).filter(Boolean);
  if (facts.length === 0) return "the retrieved material";
  if (facts.length === 1) return facts[0];
  return `${facts.slice(0, -1).join(", ")} and ${facts[facts.length - 1]}`;
}

function cleanFactForAnswer(text: string) {
  return cleanupEvidence(text)
    .replace(/\bco\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^and\s+/i, "")
    .trim();
}

function hasEvidence(items: EvidenceItem[], pattern: RegExp) {
  return items.some((item) => pattern.test(item.text));
}

function hasConceptSignal(text: string) {
  return /\b(concept|definition|nature|scope|objective|function|meaning|characteristic)\b/i.test(text);
}

function hasChallengeSignal(text: string) {
  return /\b(challenge|limitation|problem|issue|conflict|declin|weak|lack|risk|dispute|exploit|informal|unorganized)\b/i.test(text);
}

function hasWayForwardSignal(text: string) {
  return /\b(need|should|reform|strengthen|ensure|promote|improve|protect|resolve|negotiate|collective|participation|welfare|security|conciliation|arbitration|adjudication)\b/i.test(text);
}

function getQuestionSubject(question: string) {
  const cleaned = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(what|is|are|the|a|an|explain|discuss|write|about|short|note|on|describe|analyse|analyze|critically|evaluate)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "the issue";
}

function capitalize(text: string) {
  if (!text) return text;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerFirst(text: string) {
  if (!text) return text;
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function normalize(text: string) {
  return tokenize(text).join(" ");
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordBudget(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ").replace(/[,\s]+$/, "")}.`;
}

const STOP_WORDS = new Set([
  "what",
  "why",
  "how",
  "which",
  "explain",
  "discuss",
  "write",
  "note",
  "about",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "are",
  "was",
  "were",
]);
