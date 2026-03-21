import { AnswerResponse, RevisionItem, Invoice } from "./types";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// === Answer Generation ===
export async function fetchAnswer(
  prompt: string,
  subject_id: string,
  user_id: string
): Promise<AnswerResponse> {
  const r = await fetch(`${BASE}/api/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, subject_id, user_id })
  });
  if (!r.ok) throw new Error(`Answer request failed: ${r.status}`);
  return r.json();
}

// === Learn More Expansion ===
export async function learnMore(body: { response_id: string }) {
  const controller = new AbortController();
  // Set a 3-minute timeout to account for local GPU inference speed
  const timeoutId = setTimeout(() => controller.abort(), 250000); 

  try {
    const r = await fetch(`${BASE}/api/learn-more`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!r.ok) {
      const errorData = await r.json();
      throw new Error(errorData.error || `Expansion failed: ${r.status}`);
    }

    const data = await r.json();
    clearTimeout(timeoutId);

    return {
      response_id: body.response_id,
      revision_id: data.revision_id,
      // Map backend 'detailed' field to 'answer' for frontend state consistency
      detailed: data.detailed || "No expansion generated.",
      citations: data.citations || []
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error("The AI is taking a long time to think. Please try again in a moment.");
    }
    throw err;
  }
}

// === Revisions ===
export async function getRevisionsBySubject(
  subject_id: string,
  user_id: string
): Promise<RevisionItem[]> {
  const r = await fetch(
    `${BASE}/api/revisions?subject_id=${encodeURIComponent(subject_id)}&user_id=${encodeURIComponent(user_id)}`
  );
  if (!r.ok) throw new Error(`Get revisions failed: ${r.status}`);
  const data = await r.json();
  return data.items || [];
}

// === Subjects ===
export async function fetchSubjects(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/subjects`);
  if (!r.ok) throw new Error(`Subjects fetch failed: ${r.status}`);
  const data = await r.json();
  return data.subjects || ["General"];
}

// === Signup ===
export async function signupUser(body: {
  name: string;
  email: string;
  password: string;
  phone: string;
}) {
  const r = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const data = await r.json();
    throw new Error(data.error || "Signup failed");
  }

  return r.json();
}

// === Subscription / Payment (Stubbed locally) ===
export async function subscribeOrder(body: { name: string; email: string; plan: string }) {
  const r = await fetch(`${BASE}/api/payment/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Order failed: ${r.status}`);
  return r.json();
}

// === Invoice History ===
export async function fetchInvoices(): Promise<Invoice[]> {
  const r = await fetch(`${BASE}/api/invoices`);
  if (!r.ok) throw new Error(`Failed to fetch invoices: ${r.status}`);
  return r.json();
}

// === Login ===
export async function loginUser(body: { email: string; password: string }) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = await r.json();
    throw new Error(data.error || "Login failed");
  }
  return r.json(); // { accessToken, refreshToken }
}

// === Refresh Token ===
export async function refreshToken(refreshToken: string) {
  const r = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!r.ok) {
    const data = await r.json();
    throw new Error(data.error || "Refresh failed");
  }
  return r.json(); // { accessToken }
}


// -----------------------------
// Token-aware fetch wrapper
// -----------------------------
async function refreshTokenCall(refreshToken: string) {
  const r = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!r.ok) throw new Error("Refresh failed");
  return r.json(); // { accessToken }
}

export async function authFetch(url: string, options: any = {}) {
  let accessToken = localStorage.getItem("accessToken");
  options.headers = { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` };

  let res = await fetch(url, options);

  if (res.status === 401) {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try {
        const { accessToken: newToken } = await refreshTokenCall(refreshToken);
        localStorage.setItem("accessToken", newToken);
        options.headers.Authorization = `Bearer ${newToken}`;
        res = await fetch(url, options); // retry original request
      } catch {
        throw new Error("Session expired. Please log in again.");
      }
    }
  }
  return res;
}