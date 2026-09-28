import * as SecureStore from "expo-secure-store";

const STORE_KEYS = {
  accessToken: "upsc_access_token",
  refreshToken: "upsc_refresh_token",
  user: "upsc_auth_user",
};

const isWeb = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  isSubscribed: boolean;
  createdAt?: string;
};

export type SessionState = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function loadSession(): Promise<SessionState | null> {
  const [accessToken, refreshToken, userRaw] = await Promise.all([
    getItem(STORE_KEYS.accessToken),
    getItem(STORE_KEYS.refreshToken),
    getItem(STORE_KEYS.user),
  ]);

  if (!accessToken || !refreshToken || !userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as AuthUser;
    return { accessToken, refreshToken, user };
  } catch {
    return null;
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  await Promise.all([
    setItem(STORE_KEYS.accessToken, session.accessToken),
    setItem(STORE_KEYS.refreshToken, session.refreshToken),
    setItem(STORE_KEYS.user, JSON.stringify(session.user)),
  ]);
}

export async function updateStoredUser(user: AuthUser): Promise<void> {
  const userRaw = await getItem(STORE_KEYS.user);
  if (userRaw) {
    await setItem(STORE_KEYS.user, JSON.stringify(user));
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    removeItem(STORE_KEYS.accessToken),
    removeItem(STORE_KEYS.refreshToken),
    removeItem(STORE_KEYS.user),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(STORE_KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(STORE_KEYS.refreshToken);
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const raw = typeof atob === "function" ? atob(padded) : "";
    if (!raw) return null;
    const payload = JSON.parse(raw) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// Refreshes the access token before it expires so authorized calls don't 401.
export async function ensureAuth(backendUrl: string): Promise<void> {
  const session = await loadSession();
  if (!session || !session.accessToken || !session.refreshToken) return;

  let expiresAt: number | null = null;
  try {
    expiresAt = decodeJwtExp(session.accessToken);
  } catch {}

  const isExpiredSoon =
    expiresAt === null || expiresAt * 1000 - Date.now() < 60_000;

  if (!isExpiredSoon) return;

  try {
    const rotated = await apiRefresh(backendUrl, session.refreshToken);
    await saveSession({
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      user: session.user,
    });
  } catch {
    // Leave the stale session in place; the request will surface a clear error.
  }
}

function cleanUrl(backendUrl: string): string {
  return backendUrl.trim().replace(/\/+$/, "");
}

async function readErrorText(response: Response, fallback: string): Promise<Error> {
  let body = "";
  try {
    body = await response.text();
  } catch {}
  if (!body) return new Error(fallback);
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return new Error(parsed.error || parsed.message || fallback);
  } catch {
    return new Error(body || fallback);
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await readErrorText(response, `Request failed (${response.status}).`);
  }
  return response.json();
}

// -----------------------------
// Auth API
// -----------------------------

export async function apiSignup(
  backendUrl: string,
  input: { name: string; email: string; phone: string; password: string }
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  return postJson(`${cleanUrl(backendUrl)}/api/auth/signup`, input);
}

export async function apiLogin(
  backendUrl: string,
  email: string,
  password: string
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  return postJson(`${cleanUrl(backendUrl)}/api/auth/login`, { email, password });
}

export async function apiLogout(backendUrl: string, refreshToken: string): Promise<void> {
  try {
    await postJson(`${cleanUrl(backendUrl)}/api/auth/logout`, { refreshToken });
  } catch {
    // Best-effort logout; local session is cleared regardless.
  }
}

export async function apiRefresh(
  backendUrl: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  return postJson(`${cleanUrl(backendUrl)}/api/auth/refresh`, { refreshToken });
}

export async function apiVerifyEmail(
  backendUrl: string,
  email: string,
  otp: string
): Promise<{ message: string; user: AuthUser }> {
  return postJson(`${cleanUrl(backendUrl)}/api/auth/verify-email`, { email, otp });
}

export async function apiResendVerification(backendUrl: string, email: string): Promise<void> {
  await postJson(`${cleanUrl(backendUrl)}/api/auth/resend-verification`, { email });
}

export async function apiForgotPassword(backendUrl: string, email: string): Promise<void> {
  await postJson(`${cleanUrl(backendUrl)}/api/auth/forgot-password`, { email });
}

export async function apiResetPassword(
  backendUrl: string,
  email: string,
  otp: string,
  newPassword: string
): Promise<void> {
  await postJson(`${cleanUrl(backendUrl)}/api/auth/reset-password`, { email, otp, newPassword });
}

export async function apiGetMe(backendUrl: string, accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${cleanUrl(backendUrl)}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) {
      const err = new Error("Session expired") as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    throw await readErrorText(response, `Failed to load profile (${response.status}).`);
  }
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function apiUpdateMe(
  backendUrl: string,
  accessToken: string,
  input: { name?: string; phone?: string }
): Promise<AuthUser> {
  const response = await fetch(`${cleanUrl(backendUrl)}/api/auth/me`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await readErrorText(response, `Failed to update profile (${response.status}).`);
  }
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function apiChangePassword(
  backendUrl: string,
  accessToken: string,
  currentPassword: string,
  newPassword: string
): Promise<{ accessToken: string; refreshToken: string }> {
  return postJson(
    `${cleanUrl(backendUrl)}/api/auth/change-password`,
    { currentPassword, newPassword },
    { Authorization: `Bearer ${accessToken}` }
  );
}

export async function apiDeleteAccount(
  backendUrl: string,
  accessToken: string,
  currentPassword: string
): Promise<void> {
  const response = await fetch(`${cleanUrl(backendUrl)}/api/auth/me`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ currentPassword }),
  });
  if (!response.ok) {
    throw await readErrorText(response, `Failed to delete account (${response.status}).`);
  }
}

// -----------------------------
// Session orchestration helpers
// -----------------------------

export async function restoreSession(backendUrl: string): Promise<AuthUser | null> {
  const session = await loadSession();
  if (!session) return null;

  try {
    const user = await apiGetMe(backendUrl, session.accessToken);
    await updateStoredUser(user);
    return user;
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 401) {
      try {
        const rotated = await apiRefresh(backendUrl, session.refreshToken);
        await saveSession({
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
          user: session.user,
        });
        return session.user;
      } catch {
        await clearSession();
        return null;
      }
    }
    // Network/server error: keep the session so the user stays logged in.
    return session.user;
  }
}