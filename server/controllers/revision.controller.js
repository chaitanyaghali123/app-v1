import * as db from "../services/db.service.js";
import redis from "../config/redis.js"; 

// -----------------------------
// Normalize revision
// -----------------------------
function normalizeRevision(row) {
  return {
    id: row.id,
    prompt: row.prompt,
    created_at: row.created_at,
    answer: row.answer ?? ""
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
// GET /api/revisions?user_id=&cursor=
// -----------------------------
export async function getRevisionsByUser(req, res) {
  try {
    const { user_id, cursor } = req.query;

    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    if (!user_id) {
      return res.status(400).json({
        error: "user_id is required"
      });
    }

    // ✅ CACHE KEY (important for performance)
    const cacheKey = `history:${user_id}:${cursor || "start"}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // ✅ USE CURSOR FUNCTION (NOT OFFSET)
    const rows = await db.listRevisionsCursor(
      user_id,
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
    console.error("Get revisions by user failed:", err);
    return res.status(500).json({
      error: "Failed to fetch revisions"
    });
  }
}
