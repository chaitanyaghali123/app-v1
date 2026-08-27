// server/services/vector.service.js

import axios from "axios";

const BASE = process.env.FASTAPI_URL || process.env.VECTOR_API;
const API_KEY = process.env.VECTOR_API_KEY || process.env.API_KEY;
const VECTOR_TIMEOUT_MS = Number(process.env.VECTOR_API_TIMEOUT_MS || 60000);

/**
 * Query PostgreSQL pgvector retrieval API.
 */
export async function queryVector({ prompt, topK, skipRerank = false, subjectIds, apiKey }) {
  try {
    const body = {
      query: prompt,
    };

    if (topK) {
      body.top_k = topK;
    }

    if (skipRerank) {
      body.skip_rerank = true;
    }

    if (subjectIds && subjectIds.length > 0) {
      body.subject_ids = subjectIds;
    }

    // Per-user Gemini API key for question embedding (BYOK).
    if (apiKey) {
      body.api_key = apiKey;
    }

    const resp = await axios.post(`${BASE}/chunks`, body, {
      headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
      timeout: VECTOR_TIMEOUT_MS
    });
    return resp.data.chunks || [];
  } catch (err) {
    const status = err?.response?.status;
    const upstreamCode = err?.response?.data?.code;
    if (status === 429 || upstreamCode === "GEMINI_QUOTA_EXCEEDED") {
      const quotaErr = new Error(
        err?.response?.data?.error ||
          "Gemini API quota exceeded for your API key. Try again later or use a different key."
      );
      quotaErr.code = "GEMINI_QUOTA_EXCEEDED";
      throw quotaErr;
    }
    console.error("Vector retrieval failed:", err.message);
    return [];
  }
}

/**
 * 📄 Store document in vector DB
 */
export async function storeDocument({ text, doc_id }) {
  try {
    const resp = await axios.post(`${BASE}/store`, {
      text,
      docId: doc_id
    }, {
      headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
      timeout: VECTOR_TIMEOUT_MS
    });

    return resp.data;
  } catch (err) {
    console.error("❌ storeDocument failed:", err.message);
    return null;
  }
}
