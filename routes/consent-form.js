const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/consent-form/submissions
router.get('/submissions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.submission_data, s.submitted_at
       FROM submissions s
       JOIN forms f ON s.form_id = f.id
       WHERE f.form_name = 'Client Consent Form'
         AND f.form_plugin = 'gravity-forms'
         AND f.form_id = '3'
       ORDER BY s.submitted_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch consent form submissions' });
  }
});

module.exports = router;
