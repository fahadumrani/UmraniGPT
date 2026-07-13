/* ============================================================
   UMRANIGPT SERVER — Entry Point
============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');

require('dotenv').config();
const OLLAMA_ENV_PATH = path.join(__dirname, '..', 'config', 'ollama.env');
require('dotenv').config({ path: OLLAMA_ENV_PATH });

if (!fs.existsSync(OLLAMA_ENV_PATH)) {
  console.warn('[UmraniGPT] server/config/ollama.env not found — copy ollama.env.example to ollama.env and set OLLAMA_URL.');
  console.warn(`[UmraniGPT] Using default: ${process.env.OLLAMA_URL || 'http://localhost:11434'}`);
}

const db             = require('./db');
const app            = require('./app');
const bootstrapAdmin = require('./bootstrapAdmin');
const activity       = require('./services/activity');
const { logCookieConfig } = require('./utils/cookies');

bootstrapAdmin();

// Record an activity snapshot every 5 minutes, for the admin
// dashboard's live "users active over time" line chart.
activity.start(5 * 60 * 1000);

// Sweep expired sessions hourly so the table doesn't grow forever.
setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  } catch (err) {
    console.error('[UmraniGPT] Session cleanup error:', err.message);
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[UmraniGPT] Auth server running on http://localhost:${PORT}`);
  logCookieConfig();

  const origins = (process.env.FRONTEND_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origins.length === 0) {
    console.warn('[UmraniGPT] ⚠️  FRONTEND_ORIGINS is not set in server/.env');
    console.warn('[UmraniGPT]    Cross-origin requests from GitHub Pages will be rejected (401/403).');
    console.warn('[UmraniGPT]    Add:  FRONTEND_ORIGINS=https://YOURUSERNAME.github.io');
  } else {
    console.log(`[UmraniGPT] Allowed origins: ${origins.join(', ')}`);
  }
  console.log('[UmraniGPT] Point your Cloudflare Tunnel at this port to expose it, e.g.:');
  console.log(`[UmraniGPT]   cloudflared tunnel --url http://localhost:${PORT}`);
});
