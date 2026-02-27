const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/stats — global stats
router.get('/', async (req, res) => {
  try {
    const [totalRes, monthRes, clientsRes, formsRes] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM submissions'),
      pool.query(`SELECT COUNT(*) AS count FROM submissions WHERE date_trunc('month', submitted_at) = date_trunc('month', NOW())`),
      pool.query('SELECT COUNT(*) AS count FROM clients'),
      pool.query('SELECT COUNT(DISTINCT id) AS count FROM forms'),
    ]);

    res.json({
      totalSubmissions:     parseInt(totalRes.rows[0].count, 10),
      submissionsThisMonth: parseInt(monthRes.rows[0].count, 10),
      activeClients:        parseInt(clientsRes.rows[0].count, 10),
      activeForms:          parseInt(formsRes.rows[0].count, 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats/client/:clientId — per-client stats
router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const [totalRes, monthRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count FROM submissions s
         JOIN forms f ON s.form_id = f.id
         WHERE f.client_id = $1`,
        [clientId]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM submissions s
         JOIN forms f ON s.form_id = f.id
         WHERE f.client_id = $1
           AND date_trunc('month', s.submitted_at) = date_trunc('month', NOW())`,
        [clientId]
      ),
    ]);

    res.json({
      totalSubmissions:     parseInt(totalRes.rows[0].count, 10),
      submissionsThisMonth: parseInt(monthRes.rows[0].count, 10),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch client stats' });
  }
});

module.exports = router;
