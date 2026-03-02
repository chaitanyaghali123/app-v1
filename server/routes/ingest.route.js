import express from "express";
import multer from "multer";
import { handleIngest, handleIngestFile } from "../controllers/ingest.controller.js";

const router = express.Router();
const upload = multer();

// Text ingestion
router.post("/", handleIngest);

// File ingestion
router.post("/file", upload.single("file"), handleIngestFile);

export default router;
