import * as SecureStore from "expo-secure-store";

function generateDeviceId(): string {
  const chars = "abcdef0123456789";
  const bytes = new Uint8Array(32);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += chars[bytes[i] % 16];
  }
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

const DEVICE_ID_KEY = "upsc_device_id";

type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  retryAfter?: number;
  retry_after?: number;
};

function formatApiError(payload: ApiErrorPayload | null, fallback: string): string {
  const message = payload?.error || payload?.message || fallback;
  const retryAfter = payload?.retryAfter ?? payload?.retry_after;
  if (retryAfter && Number.isFinite(Number(retryAfter))) {
    return `${message} Try again in ${retryAfter} seconds.`;
  }
  return message;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  let body = "";
  try {
    body = await response.text();
  } catch {}

  if (!body) {
    return fallback;
  }

  try {
    return formatApiError(JSON.parse(body), fallback);
  } catch {
    return body;
  }
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (typeof localStorage !== "undefined") {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }
  const cached = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (cached) return cached;
  const id = generateDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

type GeminiChunk = {
  text: string;
  facet?: string;
  source?: string;
};

type ProxyOptions = {
  backendUrl: string;
  deviceId: string;
  question: string;
  chunks: GeminiChunk[];
  targetTokens: number;
  mode?: string;
  onStatus?: (status: string) => void;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
};

type ProxyResult = {
  answer: string;
  tokenCount: number;
  sentenceScores?: { sentence: string; score: number; bestChunkId: string; verdict: string }[];
  chunkScores?: number[];
};

export async function generateWithGemini(
  options: ProxyOptions
): Promise<ProxyResult> {
  const { backendUrl, deviceId, question, chunks, targetTokens, mode, onStatus, onToken, signal } = options;

  onStatus?.("Connecting to backend Gemini proxy...");

  const proxyUrl = `${backendUrl.replace(/\/+$/, "")}/api/gemini/proxy`;

  let response;
  try {
    response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        deviceId,
        question,
        chunks: chunks.map((c) => ({
          text: c.text,
          facet: c.facet,
          source: c.source,
        })),
        targetTokens,
        mode,
      }),
    });
  } catch (fetchError) {
    throw new Error(
      `Backend proxy call failed: ${fetchError instanceof Error ? fetchError.message : "Network error"}`
    );
  }

  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Backend proxy error (${response.status}): ${response.statusText}`)
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Backend proxy streaming not available.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswer = "";
  let tokenCount = 0;
  let sentenceScores: ProxyResult["sentenceScores"] = [];
  let chunkScores: ProxyResult["chunkScores"] = [];
  const processProxyLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) return;
    const jsonStr = trimmed.slice(6).trim();
    if (!jsonStr) return;
    try {
      const data = JSON.parse(jsonStr);
      if (data.type === "token") {
        fullAnswer = data.text;
        onToken?.(data.text);
      } else if (data.type === "status") {
        onStatus?.(data.status);
      } else if (data.type === "done") {
        fullAnswer = data.answer;
        tokenCount = data.tokenCount;
        sentenceScores = data.sentenceScores || [];
        chunkScores = data.chunkScores || [];
        onToken?.(data.answer);
      } else if (data.type === "error") {
        throw new Error(formatApiError(data, "Gemini request failed. Please try again."));
      }
    } catch (e) {
      if (e instanceof SyntaxError) return;
      throw e;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) processProxyLine(line);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) processProxyLine(line);
  }

  if (!fullAnswer) {
    throw new Error("Backend proxy returned an empty response.");
  }

  return {
    answer: fullAnswer,
    tokenCount,
    sentenceScores,
    chunkScores,
  };
}

export async function storeApiKeyOnBackend(backendUrl: string, apiKey: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const url = `${backendUrl.replace(/\/+$/, "")}/api/gemini/store-key`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, apiKey }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Failed to store API key on backend (${response.status}).`)
    );
  }
}

export async function deleteStoredApiKey(backendUrl: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const url = `${backendUrl.replace(/\/+$/, "")}/api/gemini/store-key`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Failed to delete API key from backend (${response.status}).`)
    );
  }
}
