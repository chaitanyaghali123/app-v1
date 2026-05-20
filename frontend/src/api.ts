// src/api.ts

// ✅ SINGLE SOURCE OF TRUTH
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// =============================
// 🔥 CHAT TYPES
// =============================
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  chatId: string;
  messages: ChatMessage[];
  context?: any[];
  source?: string;
  tokensUsed?: number;
};

// =============================
// 🚀 Auth APIs
// =============================

// Signup
export async function signupUser(body: {
  name: string;
  email: string;
  password: string;
  phone: string;
}): Promise<{ success: boolean; message?: string }> {
  const r = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Signup failed");
  return r.json();
}

// Login
export async function loginUser(body: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Login failed");
  return r.json();
}

// Refresh Token
export async function refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
  const r = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!r.ok) throw new Error("Refresh failed");
  return r.json();
}

// =============================
// 🔥 CHAT SYSTEM APIs
// =============================

// ✅ Create Chat
export async function createChat(body: { userId: string }): Promise<{ chatId: string }> {
  const r = await fetch(`${API_BASE}/chat/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Create chat failed");
  return r.json();
}

// ✅ Send Message (TEXT + FILES)
export async function sendMessage(body: {
  chatId: string;
  message: string;
  files?: File[];
}): Promise<ChatResponse> {
  const formData = new FormData();
  formData.append("chatId", body.chatId);
  formData.append("message", body.message || "");
  if (body.files && body.files.length > 0) {
    body.files.forEach((file) => {
      formData.append("files", file);
    });
  }

  // ✅ Correct endpoint: /api/chat/message
  const r = await fetch(`${API_BASE}/chat/message`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) throw new Error("Send message failed");
  return r.json();
}

// ✅ Get Chat List
export async function getChats(userId: string) {
  const r = await fetch(`${API_BASE}/chat/list?userId=${userId}`);
  if (!r.ok) throw new Error("Get chats failed");
  return r.json();
}

// ✅ Get Messages of Chat
export async function getChatMessages(chatId: string): Promise<{ messages: ChatMessage[] }> {
  const r = await fetch(`${API_BASE}/chat/${chatId}`);
  if (!r.ok) throw new Error("Get messages failed");
  return r.json();
}

// =============================
// 🔥 Payment / Subscription APIs
// =============================

// Create Payment Order
export async function createPaymentOrder(body: {
  userId: string;
  name: string;
  email: string;
  plan: string;
}): Promise<{ orderId: string; key: string; amount: number; currency: string }> {
  const r = await fetch(`${API_BASE}/payment/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Order failed");
  return r.json();
}

// =============================
// 🔥 Profile APIs
// =============================

export async function fetchProfile(userId: string): Promise<{ email: string; is_subscribed: boolean }> {
  const r = await fetch(`${API_BASE}/profile?userId=${userId}`);
  if (!r.ok) throw new Error("Failed to fetch profile");
  return r.json();
}

// =============================
// 🔥 Invoices APIs
// =============================

export async function fetchInvoices(email: string) {
  const r = await fetch(`${API_BASE}/invoices?email=${email}`);
  if (!r.ok) throw new Error("Failed to fetch invoices");
  return r.json();
}

export const subscribeOrder = async (data: any) => {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/subscription/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error("Subscription failed");
  }

  return response.json();
};