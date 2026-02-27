require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE submissions
        ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_form_external
        ON submissions (form_id, external_id)
        WHERE external_id IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('Migration complete: external_id column and unique index added.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
