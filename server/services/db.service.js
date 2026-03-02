import pg from "pg";
import crypto from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// -----------------------------
// Ensure tables exist
// -----------------------------
export async function ensureResultsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS results (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT,
      citations JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(sql);
}

export async function ensureRevisionsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT,
      expanded_answer TEXT,
      citations JSONB,
      chunk_ids TEXT[],
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(sql);
}

export async function ensureUsersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(sql);
}

export async function ensureInvoicesTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(sql);
}

// -----------------------------
// Results operations
// -----------------------------
export async function saveResult(userId, subjectId, prompt, answer, citations = []) {
  const sql = `
    INSERT INTO results (user_id, subject_id, prompt, answer, citations)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING id;
  `;
  const values = [userId, subjectId, prompt, answer, JSON.stringify(citations)];
  const { rows } = await pool.query(sql, values);
  return rows[0].id;
}

export async function getResultById(id) {
  const sql = `
    SELECT id, user_id, subject_id, prompt, answer, citations, created_at
    FROM results
    WHERE id = $1;
  `;
  const { rows } = await pool.query(sql, [id]);
  return rows[0] || null;
}

// -----------------------------
// Revisions operations
// -----------------------------
export async function saveRevision({
  user_id,
  subject_id,
  prompt,
  answer,
  expanded_answer = null,
  citations = [],
  chunk_ids = []
}) {
  const { rows } = await pool.query(
    `
    INSERT INTO revisions
    (id, user_id, subject_id, prompt, answer, expanded_answer, citations, chunk_ids)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    RETURNING *
    `,
    [crypto.randomUUID(), user_id, subject_id, prompt, answer, expanded_answer, JSON.stringify(citations), chunk_ids]
  );

  return rows[0];
}

export async function updateRevisionExpanded(id, expandedAnswer) {
  const sql = `UPDATE revisions SET expanded_answer = $2 WHERE id = $1`;
  await pool.query(sql, [id, expandedAnswer]);
}

export async function listRevisions(user_id, subject_id) {
  const sql = `
    SELECT id, user_id, subject_id, prompt,
           answer,
           expanded_answer,
           citations,
           created_at, chunk_ids
    FROM revisions
    WHERE user_id = $1 AND subject_id = $2
    ORDER BY created_at DESC
    LIMIT 100;
  `;
  const { rows } = await pool.query(sql, [user_id, subject_id]);
  return rows;
}

export async function getRevision(revision_id) {
  const sql = `
    SELECT id, user_id, subject_id, prompt,
           answer,
           expanded_answer,
           citations, chunk_ids, created_at
    FROM revisions
    WHERE id = $1;
  `;
  const { rows } = await pool.query(sql, [revision_id]);
  return rows[0] || null;
}

// -----------------------------
// Invoices operations
// -----------------------------
export async function saveInvoiceMetadata({ invoiceId, email, plan, amount, invoiceUrl }) {
  const sql = `
    INSERT INTO invoices (id, email, plan, amount, url, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `;
  await pool.query(sql, [invoiceId, email, plan, amount, invoiceUrl]);
}

export async function listInvoices() {
  const sql = `
    SELECT id, email, plan, amount, url, created_at
    FROM invoices
    ORDER BY created_at DESC
  `;
  const { rows } = await pool.query(sql);
  return rows;
}
