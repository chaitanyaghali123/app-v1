import axios from "axios";
import dotenv from "dotenv";
import { log, err } from "../utils/logger.js";

dotenv.config({ path: "/app/.env" });

log("🔗 VECTOR_API at runtime:", process.env.VECTOR_API);
log("✅ ingesthybrid.service.js loaded");

export async function ingestHybridDocument(document) {
  if (
    !document ||
    typeof document !== "object" ||
    typeof document.text !== "string" ||
    !document.metadata ||
    typeof document.metadata !== "object"
  ) {
    throw new Error("Invalid document format: expected { text, metadata }");
  }

  try {
    if (!process.env.VECTOR_API) {
      throw new Error("VECTOR_API is not defined in environment");
    }
    const vectorApi = process.env.VECTOR_API;

    // Forward document only (no subjectId, no citations)
    const response = await axios.post(
      `${vectorApi}/ingest-hybrid`,
      { document },
      { timeout: 30000 }
    );

    log(`📦 Ingestion response: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    err("❌ Ingestion failed:", errorMsg);
    return { error: errorMsg };
  }
}
