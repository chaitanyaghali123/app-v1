// controllers/revision.controller.js
import path from "path";
import * as db from "../services/db.service.js";

// Parse citations from DB (JSONB may arrive as string or object)
function parseCitations(raw) {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return [raw];
  return [];
}

// Normalize + deduplicate citations by filename
function normalizeCitations(rawCitations = []) {
  const seen = new Set();
  const out = [];

  for (const c of rawCitations) {
    if (!c) continue;

    // Allow simple string citations
    if (typeof c === "string") {
      const filename = path.basename(c);
      if (seen.has(filename)) continue;
      seen.add(filename);
      out.push({ source: filename, text: c });
      continue;
    }

    // Object citations
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

// Unified revision shape (returns values exactly as saved)
function normalizeRevision(row) {
  const citations = normalizeCitations(parseCitations(row.citations));

  return {
    id: row.id,
    prompt: row.prompt,
    subject_id: row.subject_id,
    created_at: row.created_at,
    answer: row.answer ?? "",
    expanded_answer: row.expanded_answer ?? null, // keep null if not expanded yet
    citations,
  };
}

// GET /api/revisions/:responseId
export async function getRevisionsByResponseId(req, res) {
  try {
    const { responseId } = req.params;
    const result = await db.getRevision(responseId);
    if (!result) {
      return res.status(404).json({ error: "Revision not found" });
    }
    return res.json({ items: [normalizeRevision(result)] });
  } catch (err) {
    console.error("Get revisions by responseId failed:", err);
    return res.status(500).json({ error: "Failed to fetch revisions" });
  }
}

// GET /api/revisions?subject_id=&user_id=
export async function getRevisionsBySubject(req, res) {
  try {
    const { subject_id, user_id } = req.query;
    if (!subject_id || !user_id) {
      return res.status(400).json({ error: "subject_id and user_id are required" });
    }

    const rows = await db.listRevisions(user_id, subject_id);

    // Deduplicate by id and normalize
    const seen = new Set();
    const items = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      items.push(normalizeRevision(r));
    }

    return res.json({ items });
  } catch (err) {
    console.error("Get revisions by subject failed:", err);
    return res.status(500).json({ error: "Failed to fetch revisions" });
  }
}
