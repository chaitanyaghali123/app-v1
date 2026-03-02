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

// === Chunk Retrieval ===
export async function fetchChunks(query: string, subjectId: string) {
  const r = await fetch(`${BASE}/api/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, subjectId })
  });
  if (!r.ok) throw new Error(`Chunk retrieval failed: ${r.status}`);
  return r.json();
}

// === Revisions ===
export async function getRevisionsBySubject(
  subject_id: string,
  user_id: string
): Promise<RevisionItem[]> {
  const r = await fetch(
    `${BASE}/api/revisions?subject_id=${encodeURIComponent(subject_id)}&user_id=${encodeURIComponent(user_id)}`
  );
  if (!r.ok) throw new Error(`Get revisions by subject failed: ${r.status}`);
  const data = await r.json();
  return data.items || [];
}

export async function getRevisionById(
  revision_id: string
): Promise<RevisionItem> {
  const r = await fetch(`${BASE}/api/revisions/${revision_id}`);
  if (!r.ok) throw new Error(`Get revision by id failed: ${r.status}`);
  return r.json();
}

// === Learn More Expansion ===
export async function learnMore(body: { response_id: string }) {
  const r = await fetch(`${BASE}/api/learn-more`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Learn more failed: ${r.status}`);
  const data = await r.json();
  return {
    response_id: body.response_id,
    revision_id: data.revision_id,
    answer: data.detailed || data.answer || "",
    citations: data.citations || []
  };
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
