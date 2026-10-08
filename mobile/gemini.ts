import * as SecureStore from "expo-secure-store";
import { authHeaders, ensureAuth } from "./authApi";

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

export async function storeApiKeyOnBackend(backendUrl: string, apiKey: string): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  await ensureAuth(backendUrl);
  const url = `${backendUrl.replace(/\/+$/, "")}/api/gemini/store-key`;

  const response = await fetch(url, {
    method: "POST",
    headers: await authHeaders(),
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
  await ensureAuth(backendUrl);
  const url = `${backendUrl.replace(/\/+$/, "")}/api/gemini/store-key`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: await authHeaders(),
    body: JSON.stringify({ deviceId }),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Failed to delete API key from backend (${response.status}).`)
    );
  }
}
