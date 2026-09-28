type RagChunk = {
  text?: string;
  content?: string;
  source?: string;
  score?: number;
  vector_score?: number;
  rerank_score?: number;
  relevanceScore?: number;
  metadata?: Record<string, unknown>;
};

type RagContextResponse = {
  chunks?: RagChunk[];
  chunkScores?: number[];
  chunkCount?: number;
  sourceSufficient?: boolean;
  sourceIssue?: string | null;
  mode?: string;
  targetTokens?: number;
  generationReason?: string | null;
};

type AnswerOptions = {
  backendUrl: string;
  question: string;
  subject?: string;
  maxChunks?: number;
  maxContextChars?: number;
  targetTokens?: number;
  onStatus?: (status: string) => void;
  onToken?: (answer: string) => void;
};

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractRawChunkScore(chunk: RagChunk): number | null {
  const candidates = [
    chunk.score,
    chunk.relevanceScore,
    chunk.vector_score,
    chunk.rerank_score,
    chunk.metadata?.relevance_score,
    chunk.metadata?.score,
    chunk.metadata?.vector_score,
    chunk.metadata?.search_score,
    chunk.metadata?.similarity,
  ];

  for (const candidate of candidates) {
    const score = numericValue(candidate);
    if (score !== null) return score;
  }

  return null;
}

function normalizeChunkScores(chunks: RagChunk[], explicitScores?: number[]): number[] {
  const hasUsefulExplicitScore = explicitScores?.some((score) => {
    const value = numericValue(score);
    return value !== null && value > 0;
  }) ?? false;
  const rawScores = chunks.map((chunk, index) => {
    const explicit = hasUsefulExplicitScore
      ? numericValue(explicitScores?.[index])
      : null;
    return explicit ?? extractRawChunkScore(chunk);
  });
  const validScores = rawScores.filter((score): score is number =>
    score !== null && Number.isFinite(score) && score >= 0
  );

  if (validScores.length === 0) return [];
  if (rawScores.some((score) => score === null)) return [];

  const maxScore = Math.max(...validScores);
  if (maxScore <= 0) return [];
  return rawScores.map((score) => {
    if (score === null || !Number.isFinite(score) || score < 0) return 0;
    const normalized = maxScore > 1 ? score / maxScore : score;
    return Math.max(0, Math.min(1, normalized));
  });
}

export async function answerUpscQuestionFromChunks(options: AnswerOptions) {
  const [{ getOrCreateDeviceId }, { authHeaders, ensureAuth }] = await Promise.all([
    import("./gemini"),
    import("./authApi"),
  ]);
  await ensureAuth(options.backendUrl);
  const isEssay = String(options.subject || "").trim().toLowerCase() === "essay";

  let response;
  try {
    response = await fetch(`${options.backendUrl}/api/mobile/answer`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        question: options.question,
        subject: options.subject,
        maxChunks: options.maxChunks ?? (isEssay ? 35 : 20),
        maxContextChars: options.maxContextChars ?? (isEssay ? 60000 : 40000),
        targetTokens: options.targetTokens ?? (isEssay ? 2600 : 3000),
        deviceId: await getOrCreateDeviceId(),
      }),
    });
  } catch (fetchError) {
    throw new Error(
      `Cannot reach backend at ${options.backendUrl}: ${fetchError instanceof Error ? fetchError.message : "Network error"}`
    );
  }

  if (!response.ok) {
    let message = `Unable to prepare the answer (${response.status}).`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      // keep default message
    }
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Backend answer streaming not available.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let ragContext: RagContextResponse | null = null;
  let fullAnswer = "";
  let tokenCount = 0;
  let sentenceScores: { sentence: string; score: number; bestChunkId: string; verdict: string }[] = [];
  let chunkScores: number[] = [];
  let generationReason: string | null = null;
  let sawToken = false;

  const processStreamEvent = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith("data: ")) return;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      return;
    }
    switch (data.type) {
      case "context": {
        ragContext = data as unknown as RagContextResponse;
        break;
      }
      case "status": {
        if (typeof data.status === "string") options.onStatus?.(data.status);
        break;
      }
      case "token": {
        sawToken = true;
        fullAnswer = String(data.text ?? "");
        options.onToken?.(fullAnswer);
        break;
      }
      case "done": {
        fullAnswer = String(data.answer ?? "");
        tokenCount = numericValue(data.tokenCount) ?? 0;
        if (Array.isArray(data.sentenceScores)) sentenceScores = data.sentenceScores as typeof sentenceScores;
        if (Array.isArray(data.chunkScores) && data.chunkScores.length) {
          chunkScores = data.chunkScores as number[];
        }
        generationReason = typeof data.generationReason === "string" ? data.generationReason : null;
        options.onToken?.(fullAnswer);
        break;
      }
      case "error": {
        throw new Error(
          (data.error as string) || "Gemini request failed. Please try again."
        );
      }
      default:
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) processStreamEvent(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) processStreamEvent(line);
  }

  const chunks = ragContext?.chunks ?? [];
  const effectiveScores =
    chunkScores.length > 0
      ? chunkScores
      : ragContext?.chunkScores?.length
      ? ragContext.chunkScores
      : [];

  if (generationReason === "no_chunks" || chunks.length === 0) {
    return {
      answer: "",
      chunks: [],
      chunkCount: 0,
      tokenCount: 0,
      sentenceScores: [],
      chunkScores: [],
      generatedByLlm: false,
      generationReason: "no_chunks",
      runtime: "gemini-3.5-flash-strict-rag",
    };
  }

  if (generationReason === "strict_rag_insufficient") {
    const answer =
      fullAnswer ||
      ragContext?.sourceIssue ||
      "The retrieved source chunks do not contain enough information to answer this question.";
    options.onToken?.(answer);
    return {
      answer,
      chunks,
      chunkCount: ragContext?.chunkCount ?? chunks.length,
      tokenCount: 0,
      sentenceScores: [],
      chunkScores: normalizeChunkScores(chunks, effectiveScores),
      generatedByLlm: false,
      generationReason: "strict_rag_insufficient",
      runtime: "gemini-3.5-flash-strict-rag",
    };
  }

  if (!fullAnswer.trim()) {
    throw new Error(
      "Gemini did not return a supported answer from the retrieved chunks."
    );
  }

  return {
    answer: fullAnswer,
    chunks,
    chunkCount: ragContext?.chunkCount ?? chunks.length,
    tokenCount,
    sentenceScores: sentenceScores ?? [],
    chunkScores: normalizeChunkScores(chunks, effectiveScores),
    generatedByLlm: sawToken || tokenCount > 0,
    generationReason: generationReason ?? "gemini_proxy_strict_rag",
    runtime: "gemini-3.5-flash-strict-rag",
  };
}
