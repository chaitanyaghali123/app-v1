import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

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

// === Save Refresh Token (optional persistence) ===
export async function saveRefreshToken(userId, token) {
  const sql = `
    INSERT INTO refresh_tokens (user_id, token)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token;
  `;
  await pool.query(sql, [userId, token]);
}

// === Verify Refresh Token ===
export async function verifyRefreshToken(token) {
  const sql = `SELECT * FROM refresh_tokens WHERE token = $1 LIMIT 1;`;
  const { rows } = await pool.query(sql, [token]);
  return rows[0] ? true : false;
}

// === Revoke Refresh Token (for logout) ===
export async function revokeRefreshToken(userId, token) {
  const sql = `DELETE FROM refresh_tokens WHERE user_id = $1 AND token = $2;`;
  await pool.query(sql, [userId, token]);
}

