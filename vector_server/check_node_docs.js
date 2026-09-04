const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
async function main() {
  await c.connect();
  const r = await c.query("SELECT file_name, subject_id, status FROM documents WHERE file_name LIKE '%Right_to_Information%' OR file_name LIKE '%Lokpal%' OR file_name LIKE '%Prevention_of_Corruption%'");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });