import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * GET /api/subjects
 * Returns all distinct subject IDs from upsc_chunks.
 */
export async function handleSubjects(req, res) {
  try {
    const sql = `
      SELECT DISTINCT subject_id
      FROM upsc_chunks
      WHERE subject_id IS NOT NULL AND subject_id <> ''
      ORDER BY subject_id ASC
    `;
    const { rows } = await pool.query(sql);

    // Normalize subjects
    const subjects = rows
      .map(r => (r.subject_id || "").trim())
      .filter(Boolean);

    // Fallback if no subjects yet
    if (subjects.length === 0) {
      return res.json({ subjects: ["General"] });
    }

    res.json({ subjects });
  } catch (err) {
    console.error("[handleSubjects] error:", err.message);
    res.status(500).json({
      subjects: ["General"],
      error: "Failed to fetch subjects"
    });
  }
}
