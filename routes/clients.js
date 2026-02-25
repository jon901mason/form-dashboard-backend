const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all clients
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, wordpress_url, created_at FROM clients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Add new client (API-key handshake model)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, wordpress_url } = req.body;

    if (!name || !wordpress_url) {
      return res.status(400).json({ error: 'Name and WordPress URL required' });
    }

    await client.query('BEGIN');

    // 1) Create client
    const insertedClient = await client.query(
      `INSERT INTO clients (name, wordpress_url, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, wordpress_url, created_at`,
      [name, wordpress_url, req.user.id]
    );

    const newClient = insertedClient.rows[0];

    // 2) Generate API key (shown once)
    const crypto = require('crypto');
    const api_key = 'fdc_' + crypto.randomBytes(32).toString('hex');

    // 3) Store key, linked to this client
    await client.query(
      `INSERT INTO api_keys (user_id, client_id, key_name, api_key)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, newClient.id, `${name}-connector`, api_key]
    );

    await client.query('COMMIT');

    // 4) Return client + api key (frontend displays once)
    return res.status(201).json({
      client_id: newClient.id,
      name: newClient.name,
      wordpress_url: newClient.wordpress_url,
      api_key,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { }
    console.error(err);
    return res.status(500).json({ error: 'Failed to add client' });
  } finally {
    client.release();
  }
});

// Get client details
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, wordpress_url, created_at FROM clients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

module.exports = router;