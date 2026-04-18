import pg from "pg";
import crypto from "crypto";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});


// =====================================================
// 🆕 CHAT TABLES (NEW - ChatGPT style)
// =====================================================

// 🔥 Chats table
export async function ensureChatsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
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


// =====================================================
// 🆕 CHAT OPERATIONS
// =====================================================

// ✅ Create new chat
export async function createChat(user_id, subject_id) {
  const chatId = crypto.randomUUID();

  await pool.query(
    `
    INSERT INTO chats (id, user_id, subject_id, title)
    VALUES ($1, $2, $3, $4)
    `,
    [chatId, user_id, subject_id, "New Chat"]
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
// 🟢 EXISTING CODE (UNCHANGED)
// =====================================================

// keep ALL your old tables + functions BELOW

// -----------------------------
// Results operations
// -----------------------------
export async function saveResult(userId, subjectId, prompt, answer, citations = []) {
  const { rows } = await pool.query(
    `
    INSERT INTO results (user_id, subject_id, prompt, answer, citations)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING id;
    `,
    [userId, subjectId, prompt, answer, JSON.stringify(citations)]
  );
  return rows[0].id;
}

// (rest of your file stays SAME — no deletion)
// =====================================================
// 🔹 BACKWARD COMPATIBILITY (Worker Support)
// =====================================================

export async function saveRevision({
  user_id = "anon",
  subject_id = "General",
  prompt,
  answer,
  citations = []
}) {
  try {
    const { rows } = await pool.query(
      `
      INSERT INTO revisions (user_id, subject_id, prompt, answer, citations)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id;
      `,
      [user_id, subject_id, prompt, answer, JSON.stringify(citations)]
    );

    return rows[0]?.id;
  } catch (err) {
    console.error("❌ saveRevision error:", err.message);
    return null;
  }
}
// =====================================================
// 🔹 API LOGGING (Middleware Support)
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
// 🔹 AUTH TOKEN MANAGEMENT
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

// =====================================================
// 🔹 REFRESH TOKEN MANAGEMENT
// =====================================================

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

// =====================================================
// 🔹 FIND REFRESH TOKEN
// =====================================================

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

// =====================================================
// 🔹 SAVE REFRESH TOKEN
// =====================================================

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
// 🔹 INVOICE MANAGEMENT
// =====================================================

// ✅ Save invoice
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

// ✅ List invoices
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
// 🔹 API LOGS TABLE
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

// =====================================================
// 🔹 REVISIONS TABLE
// =====================================================

export async function ensureRevisionsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS revisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        subject_id TEXT,
        prompt TEXT,
        answer TEXT,
        citations JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureRevisionsTable error:", err.message);
  }
}

// =====================================================
// 🔹 INVOICES TABLE
// =====================================================

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

// =====================================================
// 🔹 RESULTS TABLE
// =====================================================

export async function ensureResultsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        subject_id TEXT,
        prompt TEXT,
        answer TEXT,
        citations JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("❌ ensureResultsTable error:", err.message);
  }
}

// =====================================================
// 🔹 USERS TABLE
// =====================================================

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

// =====================================================
// 🔹 REFRESH TOKENS TABLE
// =====================================================

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