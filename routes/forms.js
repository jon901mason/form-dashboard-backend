const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');

router.get('/ping', (req, res) => {
  res.json({
    ok: true,
    route: '/api/forms/ping',
    auth: {
      hasUser: !!req.user,
      user: req.user || null,
    },
  });
});

router.get('/ping2', (req, res) => {
  res.json({
    ok: true,
    route: '/api/forms/ping2',
    marker: 'PING2_DEPLOY_CHECK_20260225',
    auth: {
      hasUser: !!req.user,
      user: req.user || null,
    },
  });
});

// Receive form submission from WordPress plugin
router.post('/submissions', async (req, res) => {
  try {
    const { form_id, form_name, form_plugin, submission_data, submitted_at } = req.body;

    if (!req.user || !req.user.client_id) {
      return res.status(401).json({ error: 'Missing client context (API key must be linked to a client)' });
    }

    if (!form_id || !form_plugin || !submission_data) {
      return res.status(400).json({ error: 'Missing required fields', required: ['form_id', 'form_plugin', 'submission_data'] });
    }

    // Find the form in the database (scoped to this client)
    const formResult = await pool.query(
      'SELECT id FROM forms WHERE client_id = $1 AND form_id = $2 AND form_plugin = $3',
      [req.user.client_id, String(form_id), String(form_plugin)]
    );

    if (formResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Form not found',
        hint: 'Sync forms first via POST /api/forms/sync, then retry this submission.',
        lookup: { client_id: req.user.client_id, form_id: String(form_id), form_plugin: String(form_plugin) },
      });
    }

    const dbFormId = formResult.rows[0].id;

    // Insert submission
    const submittedAt = submitted_at ? new Date(submitted_at) : new Date();

    await pool.query(
      'INSERT INTO submissions (form_id, submission_data, submitted_at) VALUES ($1, $2, $3)',
      [dbFormId, JSON.stringify(submission_data), submittedAt]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// Sync forms from WordPress plugin
router.post('/sync', async (req, res) => {
  try {
    if (!req.user || !req.user.client_id) {
      return res.status(401).json({ error: 'Missing client context (API key must be linked to a client)' });
    }

    // Accept either an array of forms OR an object wrapper { forms: [...] }
    const forms = Array.isArray(req.body) ? req.body : (req.body && Array.isArray(req.body.forms) ? req.body.forms : null);

    if (!Array.isArray(forms) || forms.length === 0) {
      return res.status(400).json({
        error: 'No forms provided',
        expected: 'Either a JSON array of forms, or { "forms": [ ... ] }',
      });
    }

    let synced = 0;

    for (const form of forms) {
      if (!form || !form.form_id || !form.form_name || !form.form_plugin) {
        // Skip invalid form objects, but don't fail the whole sync
        continue;
      }

      const schema = (form.fields !== undefined) ? form.fields : (form.form_schema !== undefined ? form.form_schema : null);

      await pool.query(
        `INSERT INTO forms (client_id, form_id, form_name, form_plugin, form_schema)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id, form_id, form_plugin)
         DO UPDATE SET
           form_name = EXCLUDED.form_name,
           form_schema = EXCLUDED.form_schema,
           updated_at = CURRENT_TIMESTAMP`,
        [req.user.client_id, String(form.form_id), String(form.form_name), String(form.form_plugin), schema === null ? null : JSON.stringify(schema)]
      );

      synced++;
    }

    res.json({ success: true, client_id: req.user.client_id, received: forms.length, synced });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync forms' });
  }
});

// Discover forms from a WordPress client
router.post('/discover/:clientId', async (req, res) => {
  try {
    const clientResult = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.clientId]);
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const forms = [];

    // Check for Gravity Forms
    try {
      const gfResponse = await axios.get(`${client.wordpress_url}/wp-json/gf/v2/forms`, {
        auth: {
          username: client.wordpress_username,
          password: client.wordpress_password_encrypted,
        },
      });

      for (const form of gfResponse.data) {
        forms.push({
          form_id: form.id,
          form_name: form.title,
          form_plugin: 'gravity-forms',
          form_schema: JSON.stringify(form.fields),
        });
      }
    } catch (err) {
      // Gravity Forms not available, continue
    }

    // Check for Contact Form 7
    try {
      const cf7Response = await axios.get(`${client.wordpress_url}/wp-json/contact-form-7/v1/contact-forms`, {
        auth: {
          username: client.wordpress_username,
          password: client.wordpress_password_encrypted,
        },
      });

      if (cf7Response.data.contact_forms) {
        for (const form of cf7Response.data.contact_forms) {
          forms.push({
            form_id: form.id,
            form_name: form.title.rendered,
            form_plugin: 'contact-form-7',
            form_schema: JSON.stringify(form),
          });
        }
      }
    } catch (err) {
      // Contact Form 7 not available, continue
    }

    // Save discovered forms to database
    for (const form of forms) {
      await pool.query(
        'INSERT INTO forms (client_id, form_id, form_name, form_plugin, form_schema) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (client_id, form_id, form_plugin) DO UPDATE SET form_schema = $5, updated_at = CURRENT_TIMESTAMP',
        [req.params.clientId, form.form_id, form.form_name, form.form_plugin, form.form_schema]
      );
    }

    res.json({ discovered: forms.length, forms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to discover forms' });
  }
});

// Get forms for a client
router.get('/client/:clientId', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, form_id, form_name, form_plugin FROM forms WHERE client_id = $1 ORDER BY form_name', [req.params.clientId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

// Get submissions for a form
router.get('/:formId/submissions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, submission_data, submitted_at FROM submissions WHERE form_id = $1 ORDER BY submitted_at DESC',
      [req.params.formId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// DELETE a submission
router.delete('/submissions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM submissions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete submission error:', err);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

module.exports = router;