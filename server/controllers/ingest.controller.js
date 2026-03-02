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
    const { document, subject_id } = req.body;

    if (
      !document ||
      typeof document !== "object" ||
      typeof document.text !== "string" ||
      typeof document.metadata !== "object"
    ) {
      return res.status(400).json({ error: "Invalid document format: expected { text, metadata }" });
    }

    // Normalize source to filename only
    if (document.metadata?.source) {
      document.metadata.source = path.basename(document.metadata.source);
    }

    // Forward subject_id if provided
    const payload = { document };
    if (subject_id) payload.subject_id = subject_id;

    const resp = await axios.post(`${BASE}/ingest-hybrid`, payload);

    res.json({
      ...resp.data,
      subject_id: subject_id || "General",
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
  const subject_id = req.body.subject_id || "General";
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "file required" });
  }

  try {
    const form = new FormData();
    form.append("file", file.buffer, {
      // Normalize filename here
      filename: path.basename(file.originalname),
      contentType: file.mimetype,
    });
    form.append("subject_id", subject_id);

    const resp = await axios.post(`${BASE}/ingest-file`, form, {
      headers: form.getHeaders(),
    });

    // Deduplicate citations if FastAPI returns them
    let rawCitations = resp.data?.citations || [];
    const seen = new Set();
    const cleanCitations = rawCitations.filter((c) => {
      const filename = c.source ? path.basename(c.source) : "";
      if (seen.has(filename)) return false;
      seen.add(filename);
      c.source = filename;
      return true;
    });

    res.json({
      ...resp.data,
      subject_id,
      topic: resp.data?.metadata?.topic || "",
      difficulty: resp.data?.metadata?.difficulty || "",
      citations: cleanCitations
    });
  } catch (err) {
    console.error("[handleIngestFile] error:", err.message);
    res.status(500).json({ error: "Ingestion failed" });
  }
};

