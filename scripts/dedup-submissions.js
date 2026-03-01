/**
 * One-time cleanup: delete duplicate submissions where external_id IS NULL
 * and a corresponding synced row (external_id IS NOT NULL) exists for the
 * same form_id + submitted_at.
 */
require('dotenv').config();
const pool = require('../db');

async function run() {
  const result = await pool.query(`
    DELETE FROM submissions s1
    WHERE s1.external_id IS NULL
      AND EXISTS (
        SELECT 1 FROM submissions s2
        WHERE s2.form_id     = s1.form_id
          AND s2.submitted_at = s1.submitted_at
          AND s2.external_id IS NOT NULL
      )
    RETURNING s1.id
  `);
  console.log(`Deleted ${result.rowCount} duplicate NULL-external_id rows`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
