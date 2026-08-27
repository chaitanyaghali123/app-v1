import { getGeminiKeyRecord } from "./services/db.service.js";
import { decryptGeminiApiKeyRecord, fingerprintGeminiApiKey } from "./services/gemini.service.js";
import { pool } from "./services/db.service.js";

const rec = await getGeminiKeyRecord("34fca381-3c03-9a98-01fa-2ecfd3ba9318");
const k = await decryptGeminiApiKeyRecord(rec);
console.log("backend view:", {
  db: (await pool.query("SELECT current_database(), inet_server_addr()::text")).rows[0],
  keyHashInRow: rec?.key_hash?.slice(0, 16),
  fingerprintOfDecrypted: fingerprintGeminiApiKey(k).slice(0, 16),
  encHead: rec?.encrypted_key?.slice(0, 24),
});
process.exit(0);
