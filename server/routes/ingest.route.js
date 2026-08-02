import express from "express";
import multer from "multer";
import {
  handleIngest,
  handleIngestFile,
  handleIngestJobStatus,
} from "../controllers/ingest.controller.js";

const router = express.Router();

const ALLOWED_MIMES = [
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Text ingestion
router.post("/", handleIngest);

// Async ingestion status
router.get("/jobs/:jobId", handleIngestJobStatus);

// File ingestion
router.post("/file", upload.single("file"), handleIngestFile);

export default router;
