type AnswerOptions = {
  backendUrl: string;
  question: string;
  subject?: string;
  onStatus?: (status: string) => void;
  onToken?: (answer: string) => void;
};

type AnswerResult = {
  answer: string;
  tokenCount: number;
  generatedByLlm: boolean;
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

export async function answerUpscQuestion(options: AnswerOptions): Promise<AnswerResult> {
  const [{ getOrCreateDeviceId }, { authHeaders, ensureAuth }] = await Promise.all([
    import("./gemini"),
    import("./authApi"),
  ]);
  await ensureAuth(options.backendUrl);

  let response;
  try {
    response = await fetch(`${options.backendUrl}/api/mobile/answer`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        question: options.question,
        subject: options.subject,
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
  let fullAnswer = "";
  let tokenCount = 0;
  let truncatedAnswer = false;
  let timedOutAnswer = false;
  let stoppedByFilter = false;
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
        truncatedAnswer = data.truncated === true;
        timedOutAnswer = data.timedOut === true;
        stoppedByFilter = data.stoppedByFilter === true;
        options.onToken?.(fullAnswer);
        break;
      }
      case "error": {
        const apiMessage =
          typeof data.apiMessage === "string" ? (data.apiMessage as string) : "";
        const apiStatus =
          typeof data.apiStatus === "string" ? (data.apiStatus as string) : "";
        const httpStatus =
          typeof data.httpStatus === "number" ? (data.httpStatus as number) : null;

        const message =
          apiMessage ||
          (data.error as string) ||
          (data.detail as string) ||
          "Gemini request failed. Please try again.";

        const diagnostic = [httpStatus ? `HTTP ${httpStatus}` : "", apiStatus]
          .filter(Boolean)
          .join(" · ");

        throw new Error(diagnostic ? `${message} (${diagnostic})` : message);
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

  if (!fullAnswer.trim()) {
    throw new Error("Gemini did not return an answer for this question.");
  }

  const notes: string[] = [];
  if (timedOutAnswer) {
    notes.push(
      "**This answer was cut short by a generation timeout. What you see is the complete part that finished before the limit — the ending may be incomplete.**"
    );
  } else if (truncatedAnswer && !stoppedByFilter) {
    // When a content filter ended generation the server already appended a notice
    // naming the reason, so adding the generic truncation note here would print two.
    notes.push("**Answer shortened to fit the response limit.**");
  }
  const finalAnswer = notes.length
    ? `${fullAnswer.trimEnd()}\n\n${notes.join("\n\n")}`
    : fullAnswer;

  return {
    answer: finalAnswer,
    tokenCount,
    generatedByLlm: sawToken || tokenCount > 0,
  };
}