import axios from "axios";

const BASE = process.env.FASTAPI_URL || process.env.VECTOR_API;

/**
 * Query ChromaDB for chunks given a prompt + subject.
 */
export async function queryChroma({ prompt, subject_id }) {
  try {
    const resp = await axios.post(`${BASE}/chunks`, {
      query: prompt,
      subjectId: subject_id
    });
    return resp.data.chunks || [];
  } catch (err) {
    console.error("❌ queryChroma failed:", err.message);
    return [];
  }
}

/**
 * Get details for a single chunk (Learn More).
 */
export async function getChunkDetails(chunk_id) {
  try {
    const resp = await axios.get(`${BASE}/details/${chunk_id}`);
    return resp.data;
  } catch (err) {
    console.error("❌ getChunkDetails failed:", err.message);
    return null;
  }
}
