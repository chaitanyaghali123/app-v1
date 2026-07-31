// ingest.controller.js

import path from "path";
import axios from "axios";
import FormData from "form-data";
import {
  enqueueDocumentIngest,
  enqueueFileIngest,
  getIngestJobStatus,
  isIngestQueueEnabled,
} from "../services/ingest-queue.service.js";

const BASE = process.env.FASTAPI_URL || process.env.VECTOR_API;

function jobResponse(req, job) {
  return {
    queued: true,
    jobId: job.id,
    status: job.status,
    statusUrl: `${req.baseUrl}/jobs/${job.id}`,
  };
}

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

    if (isIngestQueueEnabled()) {
      const job = await enqueueDocumentIngest(document);
      return res.status(202).json(jobResponse(req, job));
    }

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
    if (isIngestQueueEnabled()) {
      const job = await enqueueFileIngest(file);
      return res.status(202).json(jobResponse(req, job));
    }

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

export const handleIngestJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "jobId is required" });
    }

    const job = await getIngestJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: "Ingestion job not found" });
    }

    return res.json(job);
  } catch (err) {
    console.error("[handleIngestJobStatus] error:", err.message);
    return res.status(500).json({ error: "Failed to read ingestion job status" });
  }
};
