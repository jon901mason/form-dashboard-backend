const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');

// Generate new API key
router.post('/generate', async (req, res) => {
    try {
        const { key_name } = req.body;

        if (!key_name) {
            return res.status(400).json({ error: 'Key name required' });
        }

        const api_key = 'fdc_' + crypto.randomBytes(32).toString('hex');

        const result = await pool.query(
            'INSERT INTO api_keys (user_id, key_name, api_key) VALUES ($1, $2, $3) RETURNING id, key_name, api_key, created_at',
            [req.user.id, key_name, api_key]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to generate API key' });
    }
});

// Get user's API keys
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, key_name, api_key, created_at, last_used, is_active FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

module.exports = router;