/* ============================================================
   UMRANIGPT SERVER — Config Routes
   GET  /api/config        — public: returns safe subset for UI
   GET  /api/config/full   — admin: returns full config
   PUT  /api/config        — admin: updates and persists config
   POST /api/config/reload — admin: reloads config from disk
============================================================ */
'use strict';

const express = require('express');
const appConfig = require('../services/config');
const providers = require('../services/providers');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* Public subset — only safe, non-sensitive fields the frontend
   UI needs for its status display. No URLs, no API keys. */
router.get('/', requireAuth, (req, res) => {
  const cfg = appConfig.get();
  res.json({
    provider: cfg.provider,
    providerLabel: cfg.providers[cfg.provider]?.label || cfg.provider,
    streaming: cfg.generation?.streaming !== false,
    memoryEnabled: cfg.memory?.enabled !== false,
  });
});

/* Full config — admin only. */
router.get('/full', requireAdmin, (req, res) => {
  const cfg = appConfig.get();
  // Redact API keys from the response
  const safe = JSON.parse(JSON.stringify(cfg));
  for (const p of Object.values(safe.providers || {})) {
    if (p.apiKey) p.apiKey = p.apiKey ? '••••••••' : '';
  }
  res.json(safe);
});

/* Update config — admin only. */
router.put('/', requireAdmin, (req, res) => {
  try {
    const updated = appConfig.update(req.body);
    // Redact API keys from response
    const safe = JSON.parse(JSON.stringify(updated));
    for (const p of Object.values(safe.providers || {})) {
      if (p.apiKey) p.apiKey = '••••••••';
    }
    res.json({ ok: true, config: safe });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* Reload from disk (e.g. after manual file edit) — admin only. */
router.post('/reload', requireAdmin, (req, res) => {
  try {
    const cfg = appConfig.reload();
    res.json({ ok: true, provider: cfg.provider });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Provider health check — admin only. */
router.get('/health', requireAdmin, async (req, res) => {
  const health = await providers.checkHealth();
  const info   = providers.getProviderInfo();
  res.json({ ...health, ...info });
});

module.exports = router;
