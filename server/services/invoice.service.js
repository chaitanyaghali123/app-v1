import db from "./db.service.js";

// Save invoice using your actual table columns
export async function saveInvoice({ email, plan, amount, url }) {
  try {
    await db.query(
      `INSERT INTO invoices (id, email, plan, amount, url, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [email, plan, amount, url]
    );
    console.log(`✅ Invoice saved for ${email}`);
  } catch (err) {
    console.error("❌ Failed to save invoice:", err.message);
    throw err;
  }
}

// Fetch invoices for history
export async function getInvoices() {
  const result = await db.query(`SELECT * FROM invoices ORDER BY created_at DESC`);
  return result.rows;
}
