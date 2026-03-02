import path from "path";
import axios from "axios";
import { getChunkDetails } from "../services/vector.service.js";

/**
 * POST /api/chunk
 * Accepts a query + subjectId, returns matching chunks (retrieval step).
 */
export const handleChunk = async (req, res) => {
  try {
    const { query, subjectId } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing or invalid query" });
    }
    if (!subjectId || typeof subjectId !== "string") {
      return res.status(400).json({ error: "Missing or invalid subjectId" });
    }

    console.log("🔍 Chunk query received:", query, "subject:", subjectId);

    if (!process.env.VECTOR_API) {
      throw new Error("VECTOR_API is not defined in environment");
    }
    const vectorApi = process.env.VECTOR_API;

    try {
      // Forward both query and subjectId to FastAPI
      const response = await axios.post(`${vectorApi}/chunks`, { query, subjectId });
      let chunks = response.data?.chunks || [];

      // Normalize sources to filenames + deduplicate
      const seen = new Set();
      chunks = chunks.filter((c) => {
        if (!c.source) return true;
        const filename = path.basename(c.source);
        if (seen.has(filename)) return false;
        seen.add(filename);
        c.source = filename;
        return true;
      });

      console.log(`📚 Retrieved ${chunks.length} chunks for subject ${subjectId}`);

      return res.json({ chunks });
    } catch (proxyError) {
      console.warn("⚠️ FastAPI chunk proxy failed, falling back to static chunks");
    }

    // Fallback: static chunks for offline mode
    const chunks = [
      { text: "Context chunk 1: UPSC syllabus overview" },
      { text: "Context chunk 2: Previous year question trends" },
      { text: "Context chunk 3: Recommended sources and strategies" }
    ];
    res.json({ chunks });
  } catch (err) {
    console.error("❌ Chunking error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Chunking failed" });
  }
};

/**
 * GET /api/chunk/:chunk_id
 * Returns details for a single chunk (Learn More step).
 */
export const handleChunkDetails = async (req, res) => {
  const { chunk_id } = req.params;

  if (!chunk_id) {
    return res.status(400).json({ error: "chunk_id is required" });
  }

  try {
    const details = await getChunkDetails(chunk_id);

    res.json({
      chunk_id,
      text: details.text || "",
      source: details.source ? path.basename(details.source) : "",
      topic: details.topic || "",
      difficulty: details.difficulty || "",
      subject_id: details.subject_id || ""
    });
  } catch (err) {
    console.error("[handleChunkDetails] error:", err.message);
    res.status(500).json({ error: "Chunk details failed" });
  }
};


