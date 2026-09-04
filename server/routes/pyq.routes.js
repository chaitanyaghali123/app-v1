import { Router } from "express";
import { getPyqs, refreshPyqs } from "../services/upscPyq.service.js";

const router = Router();

const VALID_PAPERS = [
  "essay", "gs1", "gs2", "gs3", "gs4",
  "history-optional", "geography-optional", "public-administration-optional",
  "sociology-optional", "political-science-optional", "philosophy-optional",
];

router.get("/refresh", async (req, res) => {
  try {
    const result = await refreshPyqs();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("PYQ refresh error:", err);
    res.status(500).json({ success: false, message: "Refresh failed" });
  }
});

router.get("/:paper", async (req, res) => {
  try {
    const paper = req.params.paper.toLowerCase();

    if (!VALID_PAPERS.includes(paper)) {
      return res.status(400).json({
        success: false,
        message: `Invalid paper. Allowed: ${VALID_PAPERS.join(", ")}`,
      });
    }

    const pyqs = await getPyqs(paper);

    res.json({
      success: true,
      paper,
      count: pyqs.length,
      pyqs,
    });
  } catch (err) {
    console.error("PYQ fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch UPSC PYQs",
    });
  }
});

export default router;
