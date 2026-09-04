import { Router } from "express";
import { getSourceList, streamR2File } from "../services/source.service.js";

const router = Router();

const VALID_PAPERS = [
  "gs1", "gs2", "gs3", "gs4", "essay",
  "history-optional", "geography-optional", "public-administration-optional",
  "sociology-optional", "political-science-optional", "philosophy-optional",
];

router.get("/sources/:paper", async (req, res) => {
  try {
    const { paper } = req.params;
    if (!VALID_PAPERS.includes(paper)) {
      return res.status(400).json({ error: "Invalid paper. Use gs1-gs4." });
    }
    const sources = await getSourceList(paper);
    const grouped = {};
    for (const s of sources) {
      if (!grouped[s.subject_id]) {
        grouped[s.subject_id] = { subject_name: s.subject_name, files: [] };
      }
      grouped[s.subject_id].files.push({
        file_name: s.file_name,
        r2_key: s.r2_key,
        display_name: s.display_name,
      });
    }
    res.json({ paper, subjects: grouped });
  } catch (err) {
    console.error("GET /api/sources/:paper error:", err);
    res.status(500).json({ error: "Failed to load sources" });
  }
});

router.get("/sources/:paper/file/*", async (req, res) => {
  try {
    const r2Key = req.query.key;
    const filePath = req.params[0];
    const key = r2Key || filePath;
    if (!key) {
      return res.status(400).json({ error: "Missing file path" });
    }
    await streamR2File(key, res);
  } catch (err) {
    console.error("GET /api/sources/:paper/file/* error:", err);
    res.status(500).json({ error: "Failed to stream file" });
  }
});

export default router;
