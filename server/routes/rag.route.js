import { Router } from "express";
import { queryVector } from "../services/vector.service.js";
import { proxyGeminiCall } from "../services/gemini.service.js";
import { getGeminiKeyRecord, pool } from "../services/db.service.js";
import { decryptGeminiApiKeyRecord } from "../services/gemini.service.js";

const router = Router();

async function expandChunksToFullDocument(chunks, subjectIds) {
  try {
    const files = [...new Set(chunks.map((c) => c.source).filter(Boolean))];
    if (files.length === 0) return chunks;

    let sql = `SELECT source_file AS source, subject_id, chunk_index, chunk AS text, topic FROM upsc_chunks WHERE source_file = ANY($1)`;
    const params = [files];
    if (subjectIds && subjectIds.length > 0) {
      sql += ` AND subject_id = ANY($2)`;
      params.push(subjectIds);
    }
    sql += ` ORDER BY chunk_index`;

    const { rows } = await pool.query(sql, params);
    if (!rows || rows.length === 0) return chunks;

    return rows.map((r) => ({
      text: r.text || "",
      source: r.source || "",
      topic: r.topic || "",
      chunkIndex: r.chunk_index,
    }));
  } catch (err) {
    console.error("[rag/stream] full-document expansion failed:", err.message);
    return chunks;
  }
}

async function handleStream(req, res) {
  const params = req.method === "GET" ? req.query : (req.body || {});
  const { prompt, subject, deviceId } = params;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt is required" });
  }

  if (!deviceId || typeof deviceId !== "string") {
    return res.status(400).json({ error: "deviceId is required" });
  }

  try {
    const keyRecord = await getGeminiKeyRecord(deviceId);
    if (!keyRecord?.encrypted_key) {
      return res.status(404).json({
        error: "No API key found for this device. Please store your key first.",
        code: "GEMINI_KEY_NOT_FOUND",
      });
    }

    const apiKey = await decryptGeminiApiKeyRecord(keyRecord);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    if (req.socket) req.socket.setNoDelay(true);

    res.write(`data: ${JSON.stringify({ type: "status", status: "Searching knowledge base..." })}\n\n`);

    const subjectFilter = subject
      ? [String(subject).toLowerCase()]
      : undefined;

    const vectorChunks = await queryVector({
      prompt,
      topK: 25,
      skipRerank: false,
      subjectIds: subjectFilter,
    });

    const baseChunks = (Array.isArray(vectorChunks) ? vectorChunks : []).map((c) => ({
      text: c.text || "",
      source: c.metadata?.source_file || "",
      topic: c.metadata?.topic || "",
    }));

    // Expand to ALL chunks of the matched source file(s) so later sections
    // are always covered, ordered by chunk_index.
    const chunks = await expandChunksToFullDocument(baseChunks, subjectFilter);

    if (chunks.length === 0) {
      res.write(`data: ${JSON.stringify({ type: "done", answer: "No relevant source material found for this question.", tokenCount: 0, chunks: [] })}\n\n`);
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify({ type: "status", status: `Found ${chunks.length} source chunks. Generating answer...` })}\n\n`);

    const result = await proxyGeminiCall(apiKey, {
      question: prompt,
      chunks,
      targetTokens: 5000,
      mode: "strict-rag",
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
      },
      onStatus: (status) => {
        res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
      },
    });

    res.write(`data: ${JSON.stringify({ type: "done", answer: result.answer, tokenCount: result.tokenCount, chunks })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[rag/stream] error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "RAG streaming failed" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
      res.end();
    }
  }
}

router.get("/stream", handleStream);
router.post("/stream", handleStream);

export default router;
