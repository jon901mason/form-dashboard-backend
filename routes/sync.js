const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');

// POST /api/sync/client/:clientId
// Pulls all Gravity Forms entries from the WP site via the bulk-sync REST endpoint
router.post('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    // 1. Get client record
    const clientResult = await pool.query(
      'SELECT id, wordpress_url FROM clients WHERE id = $1',
      [clientId]
    );
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const client = clientResult.rows[0];

    // 2. Get an active API key for this client
    const keyResult = await pool.query(
      'SELECT api_key FROM api_keys WHERE client_id = $1 AND is_active = TRUE LIMIT 1',
      [clientId]
    );
    if (keyResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active API key found for this client' });
    }
    const apiKey = keyResult.rows[0].api_key;

    // 3. Fetch bulk data from WordPress
    const wpUrl = client.wordpress_url.replace(/\/$/, '');
    const wpRes = await axios.get(`${wpUrl}/wp-json/fdc/v1/bulk-sync`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 30000,
    });

    const entries = Array.isArray(wpRes.data) ? wpRes.data : [];
    let synced = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (!entry.form_id || !entry.form_plugin || !entry.external_id) {
        skipped++;
        continue;
      }

      // 4a. Upsert form
      await pool.query(
        `INSERT INTO forms (client_id, form_id, form_name, form_plugin, form_schema)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT (client_id, form_id, form_plugin)
         DO UPDATE SET form_name = EXCLUDED.form_name, updated_at = CURRENT_TIMESTAMP`,
        [clientId, String(entry.form_id), String(entry.form_name || ''), String(entry.form_plugin)]
      );

      // 4b. Get the internal form id
      const formResult = await pool.query(
        'SELECT id FROM forms WHERE client_id = $1 AND form_id = $2 AND form_plugin = $3',
        [clientId, String(entry.form_id), String(entry.form_plugin)]
      );
      if (formResult.rows.length === 0) { skipped++; continue; }
      const dbFormId = formResult.rows[0].id;

      // 4c. Insert submission, ignore conflicts on (form_id, external_id)
      const submittedAt = entry.submitted_at ? new Date(entry.submitted_at) : new Date();
      const result = await pool.query(
        `INSERT INTO submissions (form_id, submission_data, submitted_at, external_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (form_id, external_id) WHERE external_id IS NOT NULL
         DO UPDATE SET submission_data = EXCLUDED.submission_data,
                       submitted_at    = EXCLUDED.submitted_at
         RETURNING (xmax = 0) AS inserted`,
        [dbFormId, JSON.stringify(entry.submission_data || {}), submittedAt, String(entry.external_id)]
      );

      if (result.rows[0]?.inserted) {
        synced++;
      } else {
        skipped++;
      }
    }

    res.json({ success: true, synced, skipped, total: entries.length });
  } catch (err) {
    console.error('Sync error:', err.message);
    if (err.response) {
      return res.status(502).json({
        error: `WordPress returned ${err.response.status}: ${err.response.statusText}`,
      });
    }
    res.status(500).json({ error: err.message || 'Failed to sync' });
  }
});

module.exports = router;
