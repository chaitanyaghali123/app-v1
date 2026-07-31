import express from "express";
import multer from "multer";
import {
  handleIngest,
  handleIngestFile,
  handleIngestJobStatus,
} from "../controllers/ingest.controller.js";

const router = express.Router();
const upload = multer();

// Text ingestion
router.post("/", handleIngest);

// Async ingestion status
router.get("/jobs/:jobId", handleIngestJobStatus);

// File ingestion
router.post("/file", upload.single("file"), handleIngestFile);

export default router;
