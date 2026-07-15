import * as db from "../services/db.service.js";
import { getCache, setCache } from "../config/redis.js";

function normalizeRevision(row) {
  return {
    id: row.id,
    prompt: row.prompt,
    created_at: row.created_at,
    answer: row.answer ?? ""
  };
}

export async function getRevisionsByResponseId(req, res) {
  try {
    const { responseId } = req.params;
    const result = await db.getRevision(responseId);
    if (!result) return res.status(404).json({ error: "Revision not found" });
    return res.json({ items: [normalizeRevision(result)] });
  } catch (err) {
    console.error("Get revisions by responseId failed:", err);
    return res.status(500).json({ error: "Failed to fetch revisions" });
  }
}

export async function getRevisionsByUser(req, res) {
  try {
    const { user_id, cursor } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    const cacheKey = `history:${user_id}:${cursor || "start"}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const rows = await db.listRevisionsCursor(user_id, cursor || null, limit);

    const seen = new Set();
    const items = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      items.push(normalizeRevision(r));
    }

    const next_cursor = items.length > 0 ? items[items.length - 1].created_at : null;
    const response = { items, next_cursor, has_more: items.length === limit };

    await setCache(cacheKey, response, 60);
    return res.json(response);
  } catch (err) {
    console.error("Get revisions by user failed:", err);
    return res.status(500).json({ error: "Failed to fetch revisions" });
  }
}

