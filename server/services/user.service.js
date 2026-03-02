import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

export async function createUser({ name, email, password }) {
  const sql = `
    INSERT INTO users (name, email, password)
    VALUES ($1, $2, $3)
    RETURNING id, name, email;
  `;

  const values = [name, email, password];
  const { rows } = await pool.query(sql, values);

  return rows[0];
}
