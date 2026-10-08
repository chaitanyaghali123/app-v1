import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", ".env") });
dotenv.config({ path: path.join(here, ".env") });
const u = new URL(process.env.DATABASE_URL); u.hostname = "127.0.0.1";
process.env.DATABASE_URL = u.toString(); process.env.DB_HOST = "127.0.0.1";
const { pool } = await import("../server/services/db.service.js");

const gone = await pool.query(`SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND (c.relname ILIKE '%chunk%' OR c.relname ILIKE '%embedding%')`);
console.log("chunk/embedding tables remaining:", gone.rows[0].n);

const vec = await pool.query(`SELECT count(*)::int n FROM pg_extension WHERE extname='vector'`);
console.log("pgvector extension still installed:", vec.rows[0].n === 1 ? "yes (harmless)" : "no");

console.log("surviving tables that must still work:");
for (const n of ["users", "gemini_keys", "current_affairs", "essay_knowledge_base",
                 "gs4_ethics_knowledge_base", "upsc_pyqs", "chats", "messages", "api_logs"]) {
  const c = await pool.query(`SELECT count(*)::int n FROM "${n}"`).catch(() => ({ rows: [{ n: "ABSENT" }] }));
  console.log(`  ${n.padEnd(26)} ${c.rows[0].n}`);
}
const sz = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) s`);
console.log("database size:", sz.rows[0].s);
await pool.end();