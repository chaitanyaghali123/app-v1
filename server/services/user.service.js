import { pool } from "./db.service.js";

// === Create User ===
export async function createUser({ name, email, password, phone }) {
  const sql = `
    INSERT INTO users (name, email, password, phone)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, phone;
  `;
  const values = [name, email, password, phone];
  const { rows } = await pool.query(sql, values);
  return rows[0];
}

// === Find User by Email (for login) ===
export async function findUserByEmail(email) {
  const sql = `SELECT * FROM users WHERE email = $1 LIMIT 1;`;
  const { rows } = await pool.query(sql, [email]);
  return rows[0] || null;
}

// === Find User by ID (safe, no password) ===
export async function getUserById(id) {
  const sql = `
    SELECT
      id,
      name,
      email,
      phone,
      email_verified_at,
      is_subscribed,
      created_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `;
  const { rows } = await pool.query(sql, [id]);
  return rows[0] || null;
}

// === Find User by ID (with password, for credential checks) ===
export async function getUserByIdWithPassword(id) {
  const sql = `SELECT * FROM users WHERE id = $1 LIMIT 1;`;
  const { rows } = await pool.query(sql, [id]);
  return rows[0] || null;
}

// === Update Profile (name / phone) ===
export async function updateUserProfile(id, { name, phone }) {
  const sql = `
    UPDATE users
    SET name = COALESCE($2, name),
        phone = COALESCE($3, phone)
    WHERE id = $1
    RETURNING id, name, email, phone, email_verified_at, is_subscribed, created_at;
  `;
  const { rows } = await pool.query(sql, [id, name ?? null, phone ?? null]);
  return rows[0] || null;
}

// === Update Password (change / reset) ===
export async function updateUserPassword(id, hashedPassword) {
  const sql = `
    UPDATE users
    SET password = $2
    WHERE id = $1
    RETURNING id;
  `;
  const { rows } = await pool.query(sql, [id, hashedPassword]);
  return rows[0]?.id || null;
}

// === Mark Email Verified ===
export async function setEmailVerified(id) {
  const sql = `
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, NOW())
    WHERE id = $1
    RETURNING id;
  `;
  const { rows } = await pool.query(sql, [id]);
  return rows[0]?.id || null;
}

// === Delete Account + all referenced data ===
export async function deleteUserData(id) {
  await pool.query(`DELETE FROM user_tokens WHERE user_id = $1;`, [id]);
  await pool.query(`DELETE FROM gemini_keys WHERE user_id = $1;`, [id]);
  await pool.query(`DELETE FROM auth_codes WHERE user_id = $1;`, [id]);

  const { rows: chats } = await pool.query(
    `DELETE FROM chats WHERE user_id = $1 RETURNING id;`,
    [id]
  );
  for (const chat of chats) {
    await pool.query(`DELETE FROM messages WHERE chat_id = $1;`, [chat.id]);
  }

  await pool.query(`DELETE FROM revisions WHERE user_id = $1;`, [id]);
  await pool.query(`DELETE FROM results WHERE user_id = $1;`, [id]);
  await pool.query(`DELETE FROM api_logs WHERE user_id = $1;`, [id]);
  await pool.query(`DELETE FROM users WHERE id = $1;`, [id]);
}