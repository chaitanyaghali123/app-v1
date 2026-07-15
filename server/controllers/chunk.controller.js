// chunk.controller.js

import axios from "axios";

/**
 * POST /api/chunk
 * Accepts a query, returns matching chunks (retrieval step).
 */
export const handleChunk = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing or invalid query" });
    }

    console.log("🔍 Chunk query received:", query);

    if (!process.env.VECTOR_API) {
      throw new Error("VECTOR_API is not defined in environment");
    }
    const vectorApi = process.env.VECTOR_API;

    try {
      // Forward query only to FastAPI
      const response = await axios.post(`${vectorApi}/chunks`, { query });
      let chunks = response.data?.chunks || [];

      console.log(`📚 Retrieved ${chunks.length} chunks`);

      return res.json({ chunks });
    } catch (proxyError) {
      console.warn("⚠️ FastAPI chunk proxy failed:", proxyError.message);
      return res.status(503).json({ error: "Vector server unavailable" });
    }

    // Fallback: static chunks for offline mode
    return res.json({ chunks: [] });
  } catch (err) {
    console.error("❌ Chunking error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Chunking failed" });
  }
};

