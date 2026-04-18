// controllers/revision.controller.js

import path from "path";
import * as db from "../services/db.service.js";
import redis from "../config/redis.js"; 

// -----------------------------
// Parse citations from DB
// -----------------------------
function parseCitations(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return [raw];
  return [];
}

// -----------------------------
// Normalize + deduplicate citations
// -----------------------------
function normalizeCitations(rawCitations = []) {
  const seen = new Set();
  const out = [];

  for (const c of rawCitations) {
    if (!c) continue;

    // String citation
    if (typeof c === "string") {
      const filename = path.basename(c);
      if (seen.has(filename)) continue;
      seen.add(filename);
      out.push({ source: filename, text: c });
      continue;
    }

    // Object citation
    const filename = c.source ? path.basename(c.source) : "";
    if (!filename) continue;
    if (seen.has(filename)) continue;
    seen.add(filename);

    out.push({
      ...c,
      source: filename,
    });
  }

  return out;
}

// -----------------------------
// Normalize revision
// -----------------------------
function normalizeRevision(row) {
  const citations = normalizeCitations(parseCitations(row.citations));

  return {
    id: row.id,
    prompt: row.prompt,
    subject_id: row.subject_id,
    created_at: row.created_at,
    answer: row.answer ?? "",
    citations,
  };
}

// -----------------------------
// GET /api/revisions/:responseId
// -----------------------------
export async function getRevisionsByResponseId(req, res) {
  try {
    const { responseId } = req.params;

    const result = await db.getRevision(responseId);

    if (!result) {
      return res.status(404).json({ error: "Revision not found" });
    }

    return res.json({
      items: [normalizeRevision(result)],
    });

  } catch (err) {
    console.error("Get revisions by responseId failed:", err);
    return res.status(500).json({ error: "Failed to fetch revisions" });
  }
}

// -----------------------------
// 🚀 CURSOR PAGINATION + REDIS
// GET /api/revisions?subject_id=&user_id=&cursor=
// -----------------------------
export async function getRevisionsBySubject(req, res) {
  try {
    const { subject_id, user_id, cursor } = req.query;

    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    if (!subject_id || !user_id) {
      return res.status(400).json({
        error: "subject_id and user_id are required"
      });
    }

    // ✅ CACHE KEY (important for performance)
    const cacheKey = `history:${user_id}:${subject_id}:${cursor || "start"}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // ✅ USE CURSOR FUNCTION (NOT OFFSET)
    const rows = await db.listRevisionsCursor(
      user_id,
      subject_id,
      cursor || null,
      limit
    );

    const seen = new Set();
    const items = [];

    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      items.push(normalizeRevision(r));
    }

    // ✅ NEXT CURSOR
    const next_cursor =
      items.length > 0
        ? items[items.length - 1].created_at
        : null;

    const response = {
      items,
      next_cursor,
      has_more: items.length === limit
    };

    // ✅ SAVE CACHE (TTL = 60s)
    await redis.setex(cacheKey, 60, JSON.stringify(response));

    return res.json(response);

  } catch (err) {
    console.error("Get revisions by subject failed:", err);
    return res.status(500).json({
      error: "Failed to fetch revisions"
    });
  }
}
