// db.service.js

import pg from "pg";
import crypto from "crypto";

function readIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: readIntEnv("DB_POOL_MAX", 10),
  idleTimeoutMillis: readIntEnv("DB_IDLE_TIMEOUT_MS", 30000),
  connectionTimeoutMillis: readIntEnv("DB_CONNECTION_TIMEOUT_MS", 5000),
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.message);
});

// =====================================================
// 🆕 CHAT TABLES (ChatGPT style)
// =====================================================

// 🔥 Chats table
export async function ensureChatsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chats_user_updated
    ON chats(user_id, updated_at DESC);
  `);
}

// 🔥 Messages table
export async function ensureMessagesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat
    ON messages(chat_id, created_at);
  `);
}

export async function ensureUpscChunkMediaColumns() {
  await pool.query(`
    ALTER TABLE IF EXISTS upsc_chunks
    ADD COLUMN IF NOT EXISTS page_number INTEGER;
  `);


}

// =====================================================
// 🆕 CHAT OPERATIONS
// =====================================================

// ✅ Create new chat
export async function createChat(user_id) {
  const chatId = crypto.randomUUID();

  await pool.query(
    `
    INSERT INTO chats (id, user_id, title)
    VALUES ($1, $2, $3)
    `,
    [chatId, user_id, "New Chat"]
  );

  return { chatId };
}

// ✅ Get chats list
export async function getChats(user_id) {
  const { rows } = await pool.query(
    `
    SELECT id as "chatId", title, updated_at
    FROM chats
    WHERE user_id = $1
    ORDER BY updated_at DESC
    LIMIT 50
    `,
    [user_id]
  );

  return rows;
}

// ✅ Get messages of a chat
export async function getChatMessages(chat_id) {
  const { rows } = await pool.query(
    `
    SELECT role, content, created_at
    FROM messages
    WHERE chat_id = $1
    ORDER BY created_at ASC
    `,
    [chat_id]
  );

  return rows;
}

// ✅ Add message
export async function addMessage(chat_id, role, content) {
  await pool.query(
    `
    INSERT INTO messages (chat_id, role, content)
    VALUES ($1, $2, $3)
    `,
    [chat_id, role, content]
  );

  // update chat timestamp
  await pool.query(
    `
    UPDATE chats
    SET updated_at = NOW()
    WHERE id = $1
    `,
    [chat_id]
  );
}

// ✅ Set chat title (first message)
export async function updateChatTitle(chat_id, title) {
  await pool.query(
    `
    UPDATE chats
    SET title = $1
    WHERE id = $2
    `,
    [title.slice(0, 50), chat_id]
  );
}

// =====================================================
// RESULTS OPERATIONS (simplified)
// =====================================================
export async function saveResult(userId, prompt, answer) {
  const { rows } = await pool.query(
    `
    INSERT INTO results (user_id, prompt, answer)
    VALUES ($1, $2, $3)
    RETURNING id;
    `,
    [userId, prompt, answer]
  );
  return rows[0].id;
}

// =====================================================
// REVISIONS OPERATIONS (simplified)
// =====================================================
export async function saveRevision({
  user_id = "anon",
  prompt,
  answer
}) {
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO revisions (user_id, prompt, answer)
      VALUES ($1, $2, $3)
      RETURNING id;
      `,
      [user_id, prompt, answer]
    );

    return rows[0]?.id;
  } catch (err) {
    console.error("❌ saveRevision error:", err.message);
    return null;
  }
}

// =====================================================
// API LOGGING (Middleware Support)
// =====================================================
export async function saveApiLog({
  endpoint,
  method,
  status_code,
  response_time_ms,
  user_id = "anon"
}) {
  try {
    await pool.query(
      `
      INSERT INTO api_logs (endpoint, method, status_code, response_time_ms, user_id)
      VALUES ($1, $2, $3, $4, $5);
      `,
      [endpoint, method, status_code, response_time_ms, user_id]
    );
  } catch (err) {
    console.error("❌ saveApiLog error:", err.message);
  }
}

// =====================================================
// TOKEN MANAGEMENT
// =====================================================
export async function deleteAllUserTokens(user_id) {
  try {
    await pool.query(
      `
      DELETE FROM user_tokens
      WHERE user_id = $1;
      `,
      [user_id]
    );
  } catch (err) {
    console.error("❌ deleteAllUserTokens error:", err.message);
  }
}

export async function deleteRefreshToken(token) {
  try {
    await pool.query(
      `
      DELETE FROM user_tokens
      WHERE token = $1;
      `,
      [token]
    );
  } catch (err) {
    console.error("❌ deleteRefreshToken error:", err.message);
  }
}

export async function findRefreshToken(token) {
  try {
    const { rows } = await pool.query(
      `
      SELECT * FROM user_tokens
      WHERE token = $1;
      `,
      [token]
    );

    return rows[0] || null;
  } catch (err) {
    console.error("❌ findRefreshToken error:", err.message);
    return null;
  }
}

export async function saveRefreshToken(user_id, token) {
  try {
    await pool.query(
      `
      INSERT INTO user_tokens (user_id, token)
      VALUES ($1, $2);
      `,
      [user_id, token]
    );
  } catch (err) {
    console.error("❌ saveRefreshToken error:", err.message);
  }
}

// =====================================================
// INVOICE MANAGEMENT
// =====================================================
export async function saveInvoice({ email, plan, amount, url }) {
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO invoices (email, plan, amount, url)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
      `,
      [email, plan, amount, url]
    );

    return rows[0]?.id;
  } catch (err) {
    console.error("❌ saveInvoice error:", err.message);
    return null;
  }
}

export async function listInvoices(email) {
  try {
    const { rows } = await pool.query(
      `
      SELECT id, email, plan, amount, url, created_at
      FROM invoices
      WHERE email = $1
      ORDER BY created_at DESC;
      `,
      [email]
    );

    return rows;
  } catch (err) {
    console.error("❌ listInvoices error:", err.message);
    return [];
  }
}

// =====================================================
// TABLE ENSURE FUNCTIONS
// =====================================================
export async function ensureApiLogsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint TEXT,
        method TEXT,
        status_code INT,
        response_time_ms INT,
        user_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureApiLogsTable error:", err.message);
  }
}

export async function ensureRevisionsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS revisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        prompt TEXT,
        answer TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureRevisionsTable error:", err.message);
  }
}

export async function ensureInvoicesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        plan TEXT,
        amount NUMERIC,
        url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureInvoicesTable error:", err.message);
  }
}

export async function ensureResultsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        prompt TEXT,
        answer TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureResultsTable error:", err.message);
  }
}

export async function ensureUsersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        password TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureUsersTable error:", err.message);
  }
}

export async function ensureRefreshTokensTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        token TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureRefreshTokensTable error:", err.message);
  }
}

// =====================================================
// GEMINI KEY VAULT
// =====================================================

export async function ensureGeminiKeysTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gemini_keys (
        device_id TEXT PRIMARY KEY,
        encrypted_key TEXT NOT NULL,
        encrypted_data_key TEXT,
        encryption_version INTEGER DEFAULT 1,
        encryption_provider TEXT DEFAULT 'static-secret',
        encryption_key_id TEXT,
        key_hash TEXT,
        last_validated_at TIMESTAMP,
        last_error_code TEXT,
        last_error_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE gemini_keys
      ADD COLUMN IF NOT EXISTS encrypted_data_key TEXT,
      ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS encryption_provider TEXT DEFAULT 'static-secret',
      ADD COLUMN IF NOT EXISTS encryption_key_id TEXT,
      ADD COLUMN IF NOT EXISTS key_hash TEXT,
      ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_error_code TEXT,
      ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_gemini_keys_updated_at
      ON gemini_keys(updated_at DESC);
    `);
  } catch (err) {
    console.error("❌ ensureGeminiKeysTable error:", err.message);
  }
}

export async function upsertGeminiKey(deviceId, encryptedKey, metadata = {}) {
  const keyHash = metadata.keyHash || null;
  const encryptedDataKey = metadata.encryptedDataKey || null;
  const encryptionVersion = Number(metadata.encryptionVersion || 1);
  const encryptionProvider = metadata.encryptionProvider || "static-secret";
  const encryptionKeyId = metadata.encryptionKeyId || null;
  const { rows } = await pool.query(
    `
    INSERT INTO gemini_keys (
      device_id,
      encrypted_key,
      encrypted_data_key,
      encryption_version,
      encryption_provider,
      encryption_key_id,
      key_hash,
      last_validated_at,
      last_error_code,
      last_error_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NULL, NULL, NOW())
    ON CONFLICT (device_id)
    DO UPDATE SET
      encrypted_key = $2,
      encrypted_data_key = $3,
      encryption_version = $4,
      encryption_provider = $5,
      encryption_key_id = $6,
      key_hash = $7,
      last_validated_at = NOW(),
      last_error_code = NULL,
      last_error_at = NULL,
      updated_at = NOW()
    RETURNING device_id;
    `,
    [
      deviceId,
      encryptedKey,
      encryptedDataKey,
      encryptionVersion,
      encryptionProvider,
      encryptionKeyId,
      keyHash,
    ]
  );
  return rows[0];
}

export async function getGeminiKeyRecord(deviceId) {
  const { rows } = await pool.query(
    `
    SELECT
      device_id,
      encrypted_key,
      encrypted_data_key,
      encryption_version,
      encryption_provider,
      encryption_key_id,
      key_hash,
      last_validated_at,
      last_error_code,
      last_error_at,
      updated_at
    FROM gemini_keys
    WHERE device_id = $1
    `,
    [deviceId]
  );
  return rows[0] || null;
}

export async function getGeminiKey(deviceId) {
  const record = await getGeminiKeyRecord(deviceId);
  return record?.encrypted_key || null;
}

export async function deleteGeminiKey(deviceId) {
  await pool.query(
    `
    DELETE FROM gemini_keys WHERE device_id = $1
    `,
    [deviceId]
  );
}

export async function markGeminiKeyFailure(deviceId, errorCode) {
  await pool.query(
    `
    UPDATE gemini_keys
    SET last_error_code = $2,
        last_error_at = NOW(),
        updated_at = NOW()
    WHERE device_id = $1
    `,
    [deviceId, errorCode || "GEMINI_ERROR"]
  );
}

export async function markGeminiKeyValidated(deviceId) {
  await pool.query(
    `
    UPDATE gemini_keys
    SET last_validated_at = NOW(),
        last_error_code = NULL,
        last_error_at = NULL,
        updated_at = NOW()
    WHERE device_id = $1
    `,
    [deviceId]
  );
}

// db.service.js

export async function getUserSubscriptionStatus(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT is_subscribed FROM users WHERE id = $1`,
      [userId]
    );
    return rows[0]?.is_subscribed || false;
  } catch (err) {
    console.error("❌ getUserSubscriptionStatus error:", err.message);
    return false;
  }
}

export async function ensurePyqsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upsc_pyqs (
      id SERIAL PRIMARY KEY,
      paper TEXT NOT NULL,
      year INTEGER,
      title TEXT NOT NULL,
      pdf_url TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'UPSC',
      scraped_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_upsc_pyqs_paper_year
    ON upsc_pyqs(paper, year DESC);
  `);
}

export async function ensureCurrentAffairsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS current_affairs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      summary TEXT,
      source_url TEXT UNIQUE,
      source_name TEXT DEFAULT 'PIB',
      paper_type TEXT NOT NULL,
      topics TEXT[] DEFAULT '{}',
      published_date DATE,
      source_tier TEXT DEFAULT 'primary',
      scraped_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ca_paper_date
    ON current_affairs(paper_type, published_date DESC);
  `);
  await pool.query(`
    ALTER TABLE current_affairs ADD COLUMN IF NOT EXISTS source_tier TEXT DEFAULT 'primary';
  `);
}

export { pool };
