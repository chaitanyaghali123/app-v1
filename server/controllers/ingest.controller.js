// ingest.controller.js

import path from "path";
import crypto from "crypto";
import fsp from "fs/promises";
import axios from "axios";

const BASE = process.env.FASTAPI_URL || process.env.VECTOR_API;
const API_KEY = process.env.VECTOR_API_KEY || process.env.API_KEY;
const UPLOAD_DIR = "/app/uploads/ingest-jobs";

/**
 * POST /ingest
 * Accepts a document { text, metadata } and dispatches directly to FastAPI
 * /ingest-text (ingests the provided text; no redundant queue).
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

    const payload = {
      text: document.text,
      metadata: document.metadata,
      subject_id: document.metadata.subject_id || null,
      filename: document.metadata.source || null,
    };

    const resp = await axios.post(`${BASE}/ingest-text`, payload, {
      timeout: 10 * 60 * 1000,
      headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
    });

    res.json({
      ...resp.data,
      topic: document.metadata.topic || "",
      difficulty: document.metadata.difficulty || "",
    });
  } catch (err) {
    console.error("[handleIngest] error:", err.message);
    res.status(500).json({ error: "Ingestion failed" });
  }
};

/**
 * POST /ingest-file
 * Accepts a file upload, writes it to the shared uploads volume, and dispatches
 * the path directly to FastAPI /ingest-file (Celery-backed).
 */
export const handleIngestFile = async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "file required" });
  }

  try {
    const safeName = path
      .basename(String(file.originalname || "upload.bin"))
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);

    const jobId = crypto.randomUUID();
    const storedName = `${jobId}-${safeName}`;

    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    await fsp.writeFile(path.join(UPLOAD_DIR, storedName), file.buffer);

    const resp = await axios.post(
      `${BASE}/ingest-file`,
      {
        file_path: path.join(UPLOAD_DIR, storedName),
        subject_id: req.body?.subject_id || null,
      },
      {
        timeout: 10 * 60 * 1000,
        headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
      }
    );

    res.json({
      ...resp.data,
      filename: safeName,
      statusUrl: `${req.baseUrl}/jobs/${resp.data.job_id || jobId}`,
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

    const resp = await axios.get(`${BASE}/ingest-status/${jobId}`, {
      headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
    });
    return res.json(resp.data);
  } catch (err) {
    console.error("[handleIngestJobStatus] error:", err.message);
    return res.status(500).json({ error: "Failed to read ingestion job status" });
  }
};
