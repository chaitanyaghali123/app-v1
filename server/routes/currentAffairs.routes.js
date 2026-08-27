import { Router } from "express";
import {
  getCurrentAffairs,
  refreshCurrentAffairs,
  retagAllArticles,
} from "../services/currentAffairs.service.js";

const router = Router();

// GET /api/current-affairs?paper=gs1&range=today|week|month&tier=primary
router.get("/", async (req, res) => {
  try {
    const paper = (req.query.paper || "gs1").toLowerCase();
    const range = (req.query.range || "week").toLowerCase();
    const tier = req.query.tier || null;

    const rangeMap = { today: 1, week: 7, month: 30 };
    const days = rangeMap[range] ?? 7;

    if (!["gs1", "gs2", "gs3", "gs4"].includes(paper)) {
      return res.status(400).json({
        success: false,
        error: "paper must be gs1, gs2, gs3, or gs4",
      });
    }

    if (tier && !["primary", "deep-link"].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: "tier must be primary or deep-link",
      });
    }

    const articles = await getCurrentAffairs(paper, days, tier);

    // Separate into tiers for the frontend
    const primary = articles.filter((a) => a.source_tier === "primary");
    const deepLinks = articles.filter((a) => a.source_tier === "deep-link");

    res.json({
      success: true,
      paper,
      count: articles.length,
      articles,
      primary,
      deepLinks,
    });
  } catch (err) {
    console.error("GET /api/current-affairs error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/current-affairs/refresh
router.post("/refresh", async (_req, res) => {
  try {
    const result = await refreshCurrentAffairs();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("POST /api/current-affairs/refresh error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/current-affairs/retag — reclassify all articles with updated keywords
router.post("/retag", async (_req, res) => {
  try {
    const result = await retagAllArticles();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("POST /api/current-affairs/retag error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
