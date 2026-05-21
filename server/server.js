// server/server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Kafka } from "kafkajs";
import { Queue } from "bullmq";
import { requestLogger } from "./middleware/logger.js";

import fs from "fs";
import path from "path";

import { File } from "node:buffer";

global.File = File;

dotenv.config();

// ==========================
// 📁 ENSURE UPLOADS FOLDER
// ==========================
const uploadDir = path.resolve("uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });

  console.log("📁 uploads folder created");
}

// ==========================
// 🚀 EXPRESS APP
// ==========================
const app = express();

// ==========================
// ⚙️ CONFIG
// ==========================
const PORT = Number(process.env.PORT || 3000);

const REDIS_HOST =
  process.env.REDIS_HOST || "redis";

const REDIS_PORT =
  Number(process.env.REDIS_PORT) || 6379;

const LLAMA_API_URL =
  process.env.LLAMA_API_URL ||
  "http://llama-server:8080";

const LLAMA_MODEL =
  process.env.LLAMA_MODEL ||
  "/models/qwen2.5-7b-instruct-q4_k_m.gguf";

// ==========================
// 📨 KAFKA
// ==========================
const kafka = new Kafka({
  clientId: "aryabhata-app",

  brokers: [
    process.env.KAFKA_BROKER ||
      "kafka:9092",
  ],
});

// ==========================
// 📦 BULLMQ QUEUE
// ==========================
const queue = new Queue("llm-queue", {
  connection: {
    host: REDIS_HOST,
    port: REDIS_PORT,

    maxRetriesPerRequest: null,
  },
});

// ==========================
// 🌍 CORS
// ==========================
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:4173",
      "http://127.0.0.1:4173",
    ],

    credentials: true,
  })
);

// ==========================
// 📦 MIDDLEWARE
// ==========================
app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(requestLogger);

// ==========================
// 📂 ROUTES
// ==========================
import chunkRoutes from "./routes/chunk.route.js";
import ingestRoutes from "./routes/ingest.route.js";
import llmRoutes from "./routes/llm.route.js";
import revisionRoutes from "./routes/revision.route.js";
import authRoutes from "./routes/auth.route.js";
import subscriptionRoutes from "./routes/subscription.route.js";
import invoiceRoutes from "./routes/invoice.route.js";
import paymentRoutes from "./routes/payment.route.js";
import webhookRoutes from "./routes/webhook.route.js";
import profileRoutes from "./routes/profile.route.js";
import chatRoutes from "./routes/chat.routes.js";

// ==========================
// 🗄️ DB SERVICES
// ==========================
import {
  ensureRevisionsTable,
  ensureResultsTable,
  ensureUsersTable,
  ensureInvoicesTable,
  ensureRefreshTokensTable,
  ensureApiLogsTable,
  ensureChatsTable,
  ensureMessagesTable,
} from "./services/db.service.js";

// ==========================
// ❤️ HEALTH CHECK
// ==========================
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",

    server: "aryabhata-backend",

    llm_provider: "llama.cpp",

    llm_api: LLAMA_API_URL,

    model: LLAMA_MODEL,

    redis: REDIS_HOST,

    environment:
      process.env.NODE_ENV || "development",
  });
});

// ==========================
// 📥 LLM RESULT POLLING
// ==========================
app.get(
  "/api/llm/result/:id",
  async (req, res) => {
    try {
      const job = await queue.getJob(
        req.params.id
      );

      if (!job) {
        return res.json({
          status: "not_found",
        });
      }

      const state = await job.getState();

      if (state === "completed") {
        return res.json({
          status: "done",

          data: job.returnvalue,
        });
      }

      if (state === "failed") {
        return res.json({
          status: "failed",

          error:
            job.failedReason ||
            "Unknown failure",
        });
      }

      return res.json({
        status: state,
      });
    } catch (err) {
      console.error(
        "❌ Result fetch error:",
        err
      );

      res.status(500).json({
        error: "Failed to fetch result",
      });
    }
  }
);

// ==========================
// 🛣️ API ROUTES
// ==========================
app.use("/api/auth", authRoutes);

app.use("/api/chunk", chunkRoutes);

app.use("/api/ingest", ingestRoutes);

app.use("/api/llm", llmRoutes);

app.use("/api/revisions", revisionRoutes);

app.use(
  "/api/subscribe",
  subscriptionRoutes
);

app.use("/api/invoices", invoiceRoutes);

app.use("/api/payment", paymentRoutes);

app.use("/api/webhook", webhookRoutes);

app.use("/api/chat", chatRoutes);

app.use("/api/profile", profileRoutes);

// ==========================
// 🚀 INITIALIZE SERVER
// ==========================
async function initialize() {
  try {
    console.log(
      "⏳ Initializing database..."
    );

    await Promise.all([
      ensureRevisionsTable(),

      ensureResultsTable(),

      ensureUsersTable(),

      ensureInvoicesTable(),

      ensureRefreshTokensTable(),

      ensureApiLogsTable(),

      ensureChatsTable(),

      ensureMessagesTable(),
    ]);

    console.log(
      "✅ Database initialized"
    );

    // ==========================
    // 🚀 START SERVER
    // ==========================
    app.listen(PORT, "0.0.0.0", () => {
      console.log("\n");
      console.log(
        "🚀 Aryabhata Backend Running"
      );

      console.log(
        `🌐 Port: ${PORT}`
      );

      console.log(
        `🧠 Model: ${LLAMA_MODEL}`
      );

      console.log(
        `🔗 LLM API: ${LLAMA_API_URL}`
      );

      console.log(
        `📦 Redis: ${REDIS_HOST}:${REDIS_PORT}`
      );

      console.log(
        `🌍 Environment: ${
          process.env.NODE_ENV ||
          "development"
        }`
      );

      console.log("\n");
    });
  } catch (err) {
    console.error(
      "❌ Failed to initialize:",
      err.message
    );

    process.exit(1);
  }
}

// ==========================
// 🛑 GRACEFUL SHUTDOWN
// ==========================
process.on("SIGINT", async () => {
  console.log(
    "\n🛑 Shutting down server..."
  );

  try {
    await queue.close();

    console.log(
      "✅ Queue connection closed"
    );

    process.exit(0);
  } catch (err) {
    console.error(
      "❌ Shutdown error:",
      err
    );

    process.exit(1);
  }
});

// ==========================
// 🚀 START
// ==========================
initialize();