type RagChunk = {
  text?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type RagContextResponse = {
  chunks?: RagChunk[];
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

export async function answerUpscQuestionFromChunks(options: AnswerOptions) {
  let response;
  try {
    response = await fetch(`${options.backendUrl}/api/mobile/rag-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: options.question,
        subject: options.subject,
        maxChunks: options.maxChunks ?? 8,
        maxContextChars: options.maxContextChars ?? 12000,
        targetTokens: options.targetTokens ?? 3000,
      }),
    });
  } catch (fetchError) {
    throw new Error(
      `Cannot reach backend at ${options.backendUrl}: ${fetchError instanceof Error ? fetchError.message : "Network error"}`
    );
  }

  if (!response.ok) {
    throw new Error(`Unable to retrieve source chunks (${response.status}).`);
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
      runtime: "gemini-2.5-flash-strict-rag",
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
      chunkScores: new Array(chunks.length).fill(0),
      generatedByLlm: false,
      generationReason: "strict_rag_insufficient",
      runtime: "gemini-2.5-flash-strict-rag",
    };
  }

  const { generateWithGemini, getOrCreateDeviceId } = await import("./gemini");

  options.onStatus?.("Sending retrieved chunks to Gemini 2.5 Flash...");

  const generation = await generateWithGemini({
    backendUrl: options.backendUrl,
    deviceId: getOrCreateDeviceId(),
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
    chunkScores: generation.chunkScores ?? [],
    generatedByLlm: true,
    generationReason: "gemini_proxy_strict_rag",
    runtime: "gemini-2.5-flash-strict-rag",
  };
}
