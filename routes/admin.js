const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');

// Middleware: require is_admin on the authenticated user
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT is_admin, email FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    const isAdmin = user?.is_admin || user?.email?.trim().toLowerCase() === (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// POST /api/admin/users — create a new user
router.post('/users', requireAdmin, async (req, res) => {
  const { name, email, password, avatar_url } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING id, email, name',
      [email, hash, name, avatar_url || null]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;
