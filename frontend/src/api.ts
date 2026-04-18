import { RevisionItem, Invoice, SubjectsResponse } from "./types";

// ✅ SINGLE SOURCE OF TRUTH (IMPORTANT FIX)
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// =============================
// 🔥 CHAT TYPES
// =============================
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: any[];
};

export type ChatResponse = {
  chatId: string;
  messages: ChatMessage[];
  citations?: any[];
  context_source?: string;
  tokensUsed?: number;
};

// =============================
// 🚀 Revisions (CURSOR PAGINATION)
// =============================
export async function getRevisionsCursor(
  subject_id: string,
  user_id: string,
  cursor: string | null
): Promise<{
  items: RevisionItem[];
  next_cursor: string | null;
  has_more: boolean;
}> {
  const params = new URLSearchParams({ subject_id, user_id });
  if (cursor) params.append("cursor", cursor);

  const r = await fetch(`${API_BASE}/revisions?${params.toString()}`);

  if (!r.ok) throw new Error(`Get revisions failed: ${r.status}`);
  if (r.status === 204) return { items: [], next_cursor: null, has_more: false };

  const data = await r.json();

  return {
    items: (data.items || []) as RevisionItem[],
    next_cursor: data.next_cursor || null,
    has_more: data.has_more || false
  };
}

// =============================
// Subjects
// =============================
export async function fetchSubjects(): Promise<string[]> {
  const r = await fetch(`${API_BASE}/subjects`);

  if (!r.ok) throw new Error(`Subjects fetch failed: ${r.status}`);
  if (r.status === 204) return ["General"];

  const data = (await r.json()) as SubjectsResponse;
  return data.subjects || ["General"];
}

// =============================
// Signup
// =============================
export async function signupUser(body: {
  name: string;
  email: string;
  password: string;
  phone: string;
}): Promise<{ success: boolean; message?: string }> {
  const r = await fetch(`${API_BASE}/auth/signup`, {
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

// =============================
// Subscription / Payment
// =============================
export async function subscribeOrder(body: {
  name: string;
  email: string;
  plan: string;
}): Promise<{ orderId: string; status: string }> {
  const r = await fetch(`${API_BASE}/payment/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) throw new Error(`Order failed: ${r.status}`);
  return r.json();
}

// =============================
// Invoice History
// =============================
export async function fetchInvoices(): Promise<Invoice[]> {
  const r = await fetch(`${API_BASE}/invoices`);

  if (!r.ok) throw new Error(`Failed to fetch invoices: ${r.status}`);
  if (r.status === 204) return [];

  return r.json() as Promise<Invoice[]>;
}

// =============================
// Login
// =============================
export async function loginUser(body: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const data = await r.json();
    throw new Error(data.error || "Login failed");
  }

  return r.json();
}

// =============================
// Refresh Token
// =============================
export async function refreshToken(
  refreshToken: string
): Promise<{ accessToken: string }> {
  const r = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!r.ok) {
    const data = await r.json();
    throw new Error(data.error || "Refresh failed");
  }

  return r.json();
}

// =============================
// 🔐 Token-aware fetch wrapper
// =============================
async function refreshTokenCall(refreshToken: string): Promise<{ accessToken: string }> {
  const r = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!r.ok) throw new Error("Refresh failed");
  return r.json();
}

export async function authFetch(url: string, options: any = {}): Promise<Response> {
  let accessToken = localStorage.getItem("accessToken");

  options.headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${accessToken}`
  };

  let res = await fetch(url, options);

  if (res.status === 401) {
    const refreshToken = localStorage.getItem("refreshToken");

    if (refreshToken) {
      try {
        const { accessToken: newToken } = await refreshTokenCall(refreshToken);

        localStorage.setItem("accessToken", newToken);
        options.headers.Authorization = `Bearer ${newToken}`;

        res = await fetch(url, options);
      } catch {
        throw new Error("Session expired. Please log in again.");
      }
    }
  }

  return res;
}

// =============================
// 🔥 CHAT SYSTEM APIs
// =============================

// ✅ Create Chat
export async function createChat(body: {
  userId: string;
  subjectId: string;
}): Promise<{ chatId: string }> {
  const r = await fetch(`${API_BASE}/chat/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) throw new Error(`Create chat failed: ${r.status}`);
  return r.json();
}

// ✅ Send Message
export async function sendMessage(body: {
  chatId: string;
  message: string;
  subjectId: string;
}): Promise<ChatResponse> {
  const r = await fetch(`${API_BASE}/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!r.ok) throw new Error(`Send message failed: ${r.status}`);
  if (r.status === 204) throw new Error("Empty response from server");

  return r.json();
}

// ✅ Get Chat List
export async function getChats(userId: string) {
  const r = await fetch(`${API_BASE}/chat/list?userId=${userId}`);

  if (!r.ok) throw new Error(`Get chats failed: ${r.status}`);
  if (r.status === 204) return [];

  return r.json();
}

// ✅ Get Messages of Chat
export async function getChatMessages(
  chatId: string
): Promise<{ messages: ChatMessage[] }> {
  const r = await fetch(`${API_BASE}/chat/${chatId}`);

  if (!r.ok) throw new Error(`Get messages failed: ${r.status}`);
  if (r.status === 204) return { messages: [] };

  return r.json();
}