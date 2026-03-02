import express from "express";
import { handleAnswer } from "../controllers/answer.controller.js";

const router = express.Router();

// FIX: final endpoint is POST /api/answer
router.post("/", handleAnswer);

export default router;
