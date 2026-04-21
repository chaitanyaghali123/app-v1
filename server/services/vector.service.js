// server/services/vector.service.js

import axios from "axios";

const BASE = process.env.FASTAPI_URL || process.env.VECTOR_API;

/**
 * 🔍 Query ChromaDB
 */
export async function queryChroma({ prompt }) {
  try {
    const resp = await axios.post(`${BASE}/chunks`, {
      query: prompt
    });
    return resp.data.chunks || [];
  } catch (err) {
    console.error("❌ queryChroma failed:", err.message);
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
    });

    return resp.data;
  } catch (err) {
    console.error("❌ storeDocument failed:", err.message);
    return null;
  }
}
