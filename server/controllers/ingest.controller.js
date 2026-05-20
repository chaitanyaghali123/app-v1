// ingest.controller.js

import path from "path";
import axios from "axios";
import FormData from "form-data";

const BASE = process.env.FASTAPI_URL || process.env.VECTOR_API;

/**
 * POST /ingest
 * Accepts a document { text, metadata } and proxies to FastAPI /ingest-hybrid
 */
export const handleIngest = async (req, res) => {
  try {
    const { document } = req.body;

    if (
      !document ||
      typeof document !== "object" ||
      typeof document.text !== "string" ||
      typeof document.metadata !== "object"
    ) {
      return res.status(400).json({ error: "Invalid document format: expected { text, metadata }" });
    }

    // Normalize source to filename only if present
    if (document.metadata?.source) {
      document.metadata.source = path.basename(document.metadata.source);
    }

    // Forward document only (no subjectId)
    const payload = { document };

    const resp = await axios.post(`${BASE}/ingest-hybrid`, payload);

    res.json({
      ...resp.data,
      topic: document.metadata?.topic || "",
      difficulty: document.metadata?.difficulty || ""
    });
  } catch (err) {
    console.error("[handleIngest] error:", err.message);
    res.status(500).json({ error: "Ingestion failed" });
  }
};

/**
 * POST /ingest-file
 * Accepts a file upload and proxies to FastAPI /ingest-file
 */
export const handleIngestFile = async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "file required" });
  }

  try {
    const form = new FormData();
    form.append("file", file.buffer, {
      filename: path.basename(file.originalname),
      contentType: file.mimetype,
    });

    // Forward file only (no subjectId)
    const resp = await axios.post(`${BASE}/ingest-file`, form, {
      headers: form.getHeaders(),
    });

    res.json({
      ...resp.data,
      topic: resp.data?.metadata?.topic || "",
      difficulty: resp.data?.metadata?.difficulty || ""
    });
  } catch (err) {
    console.error("[handleIngestFile] error:", err.message);
    res.status(500).json({ error: "Ingestion failed" });
  }
};

