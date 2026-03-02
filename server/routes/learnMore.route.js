import express from "express";
import { handleLearnMore } from "../controllers/learnMore.controller.js";

const router = express.Router();

// FIX: final endpoint is POST /api/learn-more
router.post("/", handleLearnMore);

export default router;
