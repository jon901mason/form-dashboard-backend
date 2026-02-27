const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/submissions/recent?days=7
router.get('/recent', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const result = await pool.query(
      `SELECT s.id, s.submitted_at, s.submission_data,
              f.form_name, f.form_plugin,
              c.name AS client_name, c.id AS client_id
       FROM submissions s
       JOIN forms f ON s.form_id = f.id
       JOIN clients c ON f.client_id = c.id
       WHERE s.submitted_at >= NOW() - ($1 || ' days')::interval
       ORDER BY s.submitted_at DESC
       LIMIT 50`,
      [days]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch recent submissions' });
  }
});

module.exports = router;
