//server.js
import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "invoice-app",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"]
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import answerRoutes from "./routes/answer.route.js";
import chunkRoutes from "./routes/chunk.route.js";
import ingestRoutes from "./routes/ingest.route.js";
import llmRoutes from "./routes/llm.route.js";
import revisionRoutes from "./routes/revision.route.js";
import learnMoreRoutes from "./routes/learnMore.route.js";
import subjectsRoutes from "./routes/subjects.route.js";
import authRoutes from "./routes/auth.route.js"; // ✅ NEW

// Subscription + Invoice workflow
import subscriptionRoutes from "./routes/subscription.route.js";
import invoiceRoutes from "./routes/invoice.route.js";
import paymentRoutes from "./routes/payment.route.js";
import webhookRoutes from "./routes/webhook.route.js";

import {
  ensureRevisionsTable,
  ensureResultsTable,
  ensureUsersTable,
  ensureInvoicesTable // ✅ NEW
} from "./services/db.service.js";

dotenv.config();

const app = express();

// ===============================
// Middleware
// ===============================
app.use(
  cors({
    origin: "http://localhost:4173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());


app.use(express.json({ limit: "2mb" }));

// ===============================
// Health Check
// ===============================
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ===============================
// Routes
// ===============================
app.use("/api/auth", authRoutes);

app.use("/api/answer", answerRoutes);
app.use("/api/chunk", chunkRoutes);
app.use("/api/ingest", ingestRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/revisions", revisionRoutes);
app.use("/api/learn-more", learnMoreRoutes);
app.use("/api/subjects", subjectsRoutes);

// Subscription + Invoice workflow
app.use("/api/subscribe", subscriptionRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/webhook", webhookRoutes);

// ===============================
// Initialize Tables
// ===============================
async function initialize() {
  try {
    await Promise.all([
      ensureRevisionsTable(),
      ensureResultsTable(),
      ensureUsersTable(),
      ensureInvoicesTable() // ✅ NEW
    ]);

    console.log("✅ All tables ensured");

    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, () => {
      console.log(`🚀 Node server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Failed to initialize:", err.message);
    process.exit(1);
  }
}

initialize();
