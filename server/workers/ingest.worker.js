import dotenv from "dotenv";
import { runIngestWorker, stopIngestWorker } from "../services/ingest-queue.service.js";

dotenv.config();

function shutdown(signal) {
  console.log(`[ingest-worker] received ${signal}, stopping after current Redis wait`);
  stopIngestWorker();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

runIngestWorker()
  .then(() => {
    console.log("[ingest-worker] stopped");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[ingest-worker] fatal error:", err.message);
    process.exit(1);
  });
