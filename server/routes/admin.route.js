import express from "express";

const router = express.Router();

// The document-corpus (RAG) was removed. Keep the endpoint shape for the admin
// UI but report an empty corpus; nothing to query anymore.
router.get("/dashboard", (_req, res) => {
  return res.json({
    total_chunks: 0,
    total_diagrams: 0,
    subjects: [],
    gs_papers: [],
    sources: [],
    recent: [],
  });
});

export default router;
