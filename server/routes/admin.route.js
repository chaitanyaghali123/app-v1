import express from "express";
import { pool } from "../services/db.service.js";

const router = express.Router();

router.get("/dashboard", async (_req, res) => {
  try {
    const client = await pool.connect();
    try {
      const [chunkCount, subjectCounts, gsCounts, sourceStats, recentDocs] =
        await Promise.all([
          client.query("SELECT COUNT(*) as total FROM upsc_chunks"),
          client.query(`
            SELECT subject_id, COUNT(*) as chunks,
                   COUNT(DISTINCT source_file) as files
            FROM upsc_chunks
            GROUP BY subject_id
            ORDER BY chunks DESC
          `),
          client.query(`
            SELECT gs_paper, COUNT(*) as chunks,
                   COUNT(DISTINCT source_file) as files,
                   COUNT(DISTINCT subject_id) as subjects
            FROM upsc_chunks
            WHERE gs_paper IS NOT NULL AND gs_paper != 'general'
            GROUP BY gs_paper
            ORDER BY gs_paper
          `),
          client.query(`
            SELECT source_file, subject_id, gs_paper,
                   COUNT(*) as chunks,
                   MIN(created_at) as ingested_at
            FROM upsc_chunks
            GROUP BY source_file, subject_id, gs_paper
            ORDER BY source_file
          `),
          client.query(`
            SELECT DISTINCT ON (source_file) source_file, subject_id,
                   created_at as ingested_at
            FROM upsc_chunks
            ORDER BY source_file, created_at DESC
            LIMIT 20
          `),
        ]);

      const diagramCount = await client.query(
        "SELECT COUNT(*) as total FROM upsc_chunks WHERE diagram_url IS NOT NULL AND diagram_url != ''"
      );

      return res.json({
        total_chunks: Number(chunkCount.rows[0].total),
        total_diagrams: Number(diagramCount.rows[0].total),
        subjects: subjectCounts.rows.map((r) => ({
          subject_id: r.subject_id,
          chunks: Number(r.chunks),
          files: Number(r.files),
        })),
        gs_papers: gsCounts.rows.map((r) => ({
          gs_paper: r.gs_paper,
          chunks: Number(r.chunks),
          files: Number(r.files),
          subjects: Number(r.subjects),
        })),
        sources: sourceStats.rows.map((r) => ({
          source_file: r.source_file,
          subject_id: r.subject_id,
          gs_paper: r.gs_paper,
          chunks: Number(r.chunks),
          ingested_at: r.ingested_at,
        })),
        recent: recentDocs.rows.map((r) => ({
          source_file: r.source_file,
          subject_id: r.subject_id,
          ingested_at: r.ingested_at,
        })),
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Dashboard query failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
