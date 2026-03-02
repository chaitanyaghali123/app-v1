import express from "express";
import { handleChunk, handleChunkDetails } from "../controllers/chunk.controller.js";

const router = express.Router();

// Retrieval: find chunks by query
router.post("/", handleChunk);

// Learn More: get details of a specific chunk
router.get("/:chunk_id", handleChunkDetails);

export default router;
