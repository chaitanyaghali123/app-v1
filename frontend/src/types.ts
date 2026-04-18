// frontend/src/types.ts

// ===============================
// === Citations ===
// ===============================
export interface Citation {
  chunk_id: string;        // unique chunk identifier
  source: string;          // file or origin
  topic?: string;
  difficulty?: string;
  subject_id?: string;
}

// ===============================
// === Context Chunks ===
// ===============================
export interface ContextChunk {
  text: string;
  metadata: {
    chunk_id?: string;
    source?: string;
    topic?: string;
    difficulty?: string;
    subject_id?: string;
    [key: string]: any;
  };
}

// ===============================
// === Answer Response ===
// ===============================
export interface AnswerResponse {
  revision_id?: string | null;
  prompt: string;
  subject_id: string;
  answer: string;
  citations?: Citation[];
}

// ===============================
// === Revision Item ===
// ===============================
export interface RevisionItem {
  id?: string;
  prompt: string;
  subject_id: string;
  created_at: string;
  answer: string;
  citations?: Citation[];
}

// ===============================
// === Chunk ===
// ===============================
export interface Chunk {
  id: string;
  text: string;
  source: string;
}

// ===============================
// === Subjects Response ===
// ===============================
export interface SubjectsResponse {
  subjects: string[];
}

// ===============================
// === Invoice ===
// ===============================
export interface Invoice {
  id: string;
  email: string;
  plan: string;
  amount: number;
  url: string;
  created_at: string;
}

// ===============================
// 🔥 CHAT SYSTEM TYPES (FINAL)
// ===============================

// ✅ Chat (sidebar list)
export interface Chat {
  chatId: string;        // ✅ matches backend
  user_id: string;
  subject_id: string;
  title: string;
  created_at: string;
}

// ✅ Chat message (conversation UI)
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];   // ✅ important
}

// ✅ DB message (internal use)
export interface ChatDBMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ===============================
// === API RESPONSES ===
// ===============================

// /chat/create
export interface CreateChatResponse {
  chatId: string;
}

// /chat/message
export interface SendMessageResponse {
  chatId: string;
  messages: ChatMessage[];
  citations?: Citation[];
  context_source?: string;
  tokensUsed?: number;
}

// /chat/list
export type ChatListResponse = Chat[];

// /chat/:chatId
export interface ChatMessagesResponse {
  messages: ChatMessage[];
}