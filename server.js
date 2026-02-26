require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');

// Express app setup
const app = express();

// Middleware
app.use(helmet());

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (token.startsWith('fdc_')) {
    pool.query(
      'SELECT user_id, client_id FROM api_keys WHERE api_key = $1 AND is_active = true',
      [token],
      (err, result) => {
        if (err || result.rows.length === 0) {
          return res.status(403).json({ error: 'Invalid API key' });
        }
        req.user = { id: result.rows[0].user_id, client_id: result.rows[0].client_id };
        next();
      }
    );
  } else {
    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Invalid token' });
      req.user = user;
      next();
    });
  }
};

// Routes
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const formRoutes = require('./routes/forms');
const apiKeysRoutes = require('./routes/api-keys');

app.use('/api/auth', authRoutes);
app.use('/api/clients', authenticateToken, clientRoutes);
app.use('/api/forms', authenticateToken, formRoutes);
app.use('/api/api-keys', authenticateToken, apiKeysRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { pool, app };