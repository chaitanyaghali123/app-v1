import express from "express";
import { handleChunk } from "../controllers/chunk.controller.js";

const router = express.Router();

// ✅ Retrieval: find chunks by query
router.post("/", handleChunk);

export default router;
