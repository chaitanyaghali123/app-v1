// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { requestLogger } from "./middleware/logger.js";
import fs from "fs";
import path from "path";
import { File } from "node:buffer";
global.File = File;

dotenv.config();

// Ensure uploads folder exists
const uploadDir = path.resolve("uploads");
const diagramAssetsDir = path.resolve(process.env.DIAGRAM_ASSET_DIR || "diagram-assets");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 uploads folder created");
}
if (!fs.existsSync(diagramAssetsDir)) {
  fs.mkdirSync(diagramAssetsDir, { recursive: true });
}

// Routes
import chunkRoutes from "./routes/chunk.route.js";
import ingestRoutes from "./routes/ingest.route.js";
// import llmRoutes from "./routes/llm.route.js"; // disabled: phone does on-device LLM generation

import revisionRoutes from "./routes/revision.route.js";
import authRoutes from "./routes/auth.route.js";
import mobileRoutes from "./routes/mobile.route.js";
import geminiRoutes from "./routes/gemini.route.js";
import subjectRoutes from "./routes/subject.route.js";
import ragRoutes from "./routes/rag.route.js";

// DB
import {
  ensureRevisionsTable,
  ensureUsersTable,
  ensureApiLogsTable,
  ensureGeminiKeysTable,
  ensureUpscChunkMediaColumns,
} from "./services/db.service.js";

import multer from "multer";

const app = express();

const trustProxy = process.env.TRUST_PROXY ?? "1";
if (trustProxy !== "false") {
  app.set("trust proxy", trustProxy === "true" ? true : Number(trustProxy) || trustProxy);
}

// Security headers (replaces helmet)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:* https:;");
  next();
});

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(requestLogger);

// Serve web app (Expo web export)
app.use(
  "/diagram-assets",
  express.static(diagramAssetsDir, {
    immutable: true,
    maxAge: "30d",
  })
);
app.use(express.static(path.resolve("dist")));

// Health Check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    llm_connected: process.env.LLAMA_API_URL || "not configured",
    model: process.env.LLAMA_MODEL || "not configured",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chunk", chunkRoutes);
app.use("/api/ingest", ingestRoutes);
app.use("/api/revisions", revisionRoutes);
app.use("/api/mobile", mobileRoutes);
app.use("/api", geminiRoutes);
app.use("/api", subjectRoutes);
app.use("/api/rag", ragRoutes);

// Global error handler (Multer errors, validation errors, etc.)
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large (max 10 MB)" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message?.startsWith("Unsupported file type")) {
    return res.status(415).json({ error: err.message });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
});

// Init DB + Server
async function initialize() {
  try {
    await Promise.all([
      ensureRevisionsTable(),
      ensureUsersTable(),
      ensureApiLogsTable(),
      ensureGeminiKeysTable(),
      ensureUpscChunkMediaColumns(),
    ]);

    console.log("✅ Database initialized");

    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(
        `🔗 LLM: llama-server (${process.env.LLAMA_MODEL || "not configured"})`
      );
    });
  } catch (err) {
    console.error("❌ Failed to initialize:", err.message);
    process.exit(1);
  }
}

initialize();
