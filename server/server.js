import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Kafka } from "kafkajs";
import { Queue } from "bullmq";

// 🔥 NEW: request logger
import { requestLogger } from "./middleware/logger.js";

// ✅ NEW: file system fix
import fs from "fs";
import path from "path";

// Load env FIRST
dotenv.config();

// ===============================
// ✅ Ensure uploads folder exists
// ===============================
const uploadDir = path.resolve("uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 uploads folder created");
}

// ===============================
// Kafka
// ===============================
const kafka = new Kafka({
  clientId: "invoice-app",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"]
});

// ===============================
// Routes
// ===============================
import chunkRoutes from "./routes/chunk.route.js";
import ingestRoutes from "./routes/ingest.route.js";
import llmRoutes from "./routes/llm.route.js";
import revisionRoutes from "./routes/revision.route.js";
import authRoutes from "./routes/auth.route.js";
import subscriptionRoutes from "./routes/subscription.route.js";
import invoiceRoutes from "./routes/invoice.route.js";
import paymentRoutes from "./routes/payment.route.js";
import webhookRoutes from "./routes/webhook.route.js";

// 🆕 NEW CHAT ROUTES
import chatRoutes from "./routes/chat.routes.js";

// ===============================
// DB
// ===============================
import {
  ensureRevisionsTable,
  ensureResultsTable,
  ensureUsersTable,
  ensureInvoicesTable,
  ensureRefreshTokensTable,
  ensureApiLogsTable,
  ensureChatsTable,
  ensureMessagesTable
} from "./services/db.service.js";

const app = express();

// ===============================
// 🛡️ CORS
// ===============================
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:4173",
      "http://127.0.0.1:4173"
    ],
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));

// ===============================
// 🔥 REQUEST LOGGING
// ===============================
app.use(requestLogger);

// ===============================
// 🔥 QUEUE (BullMQ)
// ===============================
const queue = new Queue("llm-queue", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: 6379,
    maxRetriesPerRequest: null
  }
});

// ===============================
// Health Check
// ===============================
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    llm_connected: process.env.LLM_API_URL || "not configured"
  });
});

// ===============================
// 🚀 LLM RESULT POLLING
// ===============================
app.get("/api/llm/result/:id", async (req, res) => {
  try {
    const job = await queue.getJob(req.params.id);

    if (!job) {
      return res.json({ status: "not_found" });
    }

    const state = await job.getState();

    if (state === "completed") {
      return res.json({
        status: "done",
        data: job.returnvalue
      });
    }

    return res.json({ status: state });
  } catch (err) {
    console.error("❌ Result fetch error:", err);
    res.status(500).json({ error: "Failed to fetch result" });
  }
});

// ===============================
// Routes
// ===============================
app.use("/api/auth", authRoutes);
app.use("/api/chunk", chunkRoutes);
app.use("/api/ingest", ingestRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/revisions", revisionRoutes);
app.use("/api/subscribe", subscriptionRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/webhook", webhookRoutes);
app.use("/api/chat", chatRoutes);

// ===============================
// Init DB + Server
// ===============================
async function initialize() {
  try {
    await Promise.all([
      ensureRevisionsTable(),
      ensureResultsTable(),
      ensureUsersTable(),
      ensureInvoicesTable(),
      ensureRefreshTokensTable(),
      ensureApiLogsTable(),
      ensureChatsTable(),
      ensureMessagesTable()
    ]);

    console.log("✅ Database initialized (with chat system)");

    const PORT = Number(process.env.PORT || 3000);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔗 LLM: ${process.env.LLM_API_URL}`);
    });
  } catch (err) {
    console.error("❌ Failed to initialize:", err.message);
    process.exit(1);
  }
}

initialize();
