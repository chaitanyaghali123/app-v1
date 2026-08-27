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

function countWords(text: string): number {
  return text.match(/\b[\w'-]+\b/g)?.length || 0;
}

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
  let response;
  try {
    const { getOrCreateDeviceId } = await import("./gemini");
    response = await fetch(`${options.backendUrl}/api/mobile/rag-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: options.question,
        subject: options.subject,
        maxChunks: options.maxChunks ?? 25,
        maxContextChars: options.maxContextChars ?? 40000,
        targetTokens: options.targetTokens ?? 3000,
        deviceId: await getOrCreateDeviceId(),
      }),
    });
  } catch (fetchError) {
    throw new Error(
      `Cannot reach backend at ${options.backendUrl}: ${fetchError instanceof Error ? fetchError.message : "Network error"}`
    );
  }

  if (!response.ok) {
    let message = `Unable to retrieve source chunks (${response.status}).`;
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

  const ragContext = (await response.json()) as RagContextResponse;
  const chunks = ragContext.chunks ?? [];
  const effectiveTargetTokens = ragContext.targetTokens ?? options.targetTokens ?? 1400;
  const effectiveMode = ragContext.mode ?? "strict-rag";

  if (chunks.length === 0) {
    return {
      answer: "",
      chunks: [],
      chunkCount: 0,
      tokenCount: 0,
      generatedByLlm: false,
      generationReason: "no_chunks",
      runtime: "gemini-3.5-flash-strict-rag",
    };
  }

  if (ragContext.sourceSufficient === false) {
    const answer =
      ragContext.sourceIssue ||
      "The retrieved source chunks do not contain enough information to answer this question.";
    options.onToken?.(answer);
    return {
      answer,
      chunks,
      chunkCount: ragContext.chunkCount ?? chunks.length,
      tokenCount: countWords(answer),
      sentenceScores: [],
      chunkScores: normalizeChunkScores(chunks, ragContext.chunkScores),
      generatedByLlm: false,
      generationReason: "strict_rag_insufficient",
      runtime: "gemini-3.5-flash-strict-rag",
    };
  }

  const { generateWithGemini, getOrCreateDeviceId } = await import("./gemini");

  options.onStatus?.("Sending retrieved chunks to Gemini 3.5 Flash...");

  const generation = await generateWithGemini({
    backendUrl: options.backendUrl,
    deviceId: await getOrCreateDeviceId(),
    question: options.question,
    chunks: chunks
      .map((chunk) => ({
        text: chunk.text ?? chunk.content ?? "",
        facet:
          typeof chunk.metadata?.rag_facet === "string"
            ? chunk.metadata.rag_facet
            : "supporting-evidence",
        source:
          typeof chunk.metadata?.source_file === "string"
            ? chunk.metadata.source_file
            : chunk.source,
      }))
      .filter((chunk) => Boolean(chunk.text)),
    targetTokens: effectiveTargetTokens,
    mode: effectiveMode,
    onStatus: options.onStatus,
    onToken: options.onToken,
  });

  if (!generation.answer.trim()) {
    throw new Error(
      "Gemini did not return a supported answer from the retrieved chunks."
    );
  }

  return {
    answer: generation.answer,
    chunks,
    chunkCount: ragContext.chunkCount ?? chunks.length,
    tokenCount: generation.tokenCount ?? 0,
    sentenceScores: generation.sentenceScores ?? [],
    chunkScores: normalizeChunkScores(
      chunks,
      generation.chunkScores?.length ? generation.chunkScores : ragContext.chunkScores
    ),
    generatedByLlm: true,
    generationReason: "gemini_proxy_strict_rag",
      runtime: "gemini-3.5-flash-strict-rag",
  };
}
