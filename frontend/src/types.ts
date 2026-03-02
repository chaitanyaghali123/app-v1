// === Citations ===
export interface Citation {
  chunk_id: string;        // unique chunk identifier
  source: string;          // file or origin
  topic?: string;
  difficulty?: string;
  subject_id?: string;
}

// === Context Chunks ===
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

// === Answer Response ===
export interface AnswerResponse {
  revision_id?: string | number | null;
  prompt: string;
  subject_id: string;
  answer: string;                  // normal answer
  expanded_answer?: string | null; // ✅ include expanded answer
  citations?: Citation[];          // normalized citations
}

// === Revision Item ===
export interface RevisionItem {
  id?: string;                     // revision identifier
  prompt: string;
  subject_id: string;
  created_at: string;
  answer: string;                  // normal answer
  expanded_answer?: string | null; // ✅ include expanded answer
  citations?: Citation[];          // optional citations
}

// === Chunk ===
export interface Chunk {
  id: string;
  text: string;
  source: string;
}

// === Subjects Response ===
export interface SubjectsResponse {
  subjects: string[];
}

// === Invoice (for subscription workflow) ===
export interface Invoice {
  id: string;
  email: string;
  plan: string;
  amount: number;
  url: string;
  created_at: string;
}
