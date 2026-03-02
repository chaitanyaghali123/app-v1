// Answer from LLM
export interface Citation {
  id?: string;
  source: string;
  topic?: string;
  difficulty?: string;
}

export interface ContextChunk {
  metadata: {
    source: string;
    topic?: string;
    difficulty?: string;
  };
}

export interface AnswerResponse {
  answer: string;
  
  citations: Citation[];
  context_chunks: ContextChunk[];
  prompt: string;
  subject_id: string;
  revision_id: string | null;
}

// Revision history item
export interface RevisionItem {
  prompt_id: string;
  prompt: string;
  answer: string;
 
  citations: Citation[];
  subject_id: string;
  created_at: string;
}

// Suggestions response
export interface SuggestionsResponse {
  suggestions: string[];
}
