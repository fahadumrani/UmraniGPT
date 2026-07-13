/* ============================================================
   UMRANIGPT SERVER — Admin Routes
   All routes here require an authenticated administrator session.
============================================================ */
'use strict';

const express = require('express');
const db = require('../db');
const { requireAdmin, ONLINE_WINDOW_MS } = require('../middleware/auth');
const providers = require('../services/providers');
const appConfig = require('../services/config');
const system = require('../utils/system');
const memory = require('../services/memory');
const activity = require('../services/activity');

const router = express.Router();
router.use(requireAdmin);

const getOnlineUserIds = () => {
  const now = Date.now();
  return new Set(
    db.prepare(`
      SELECT DISTINCT user_id FROM sessions
      WHERE expires_at > ? AND last_seen_at > ?
    `).all(now, now - ONLINE_WINDOW_MS).map(r => r.user_id)
  );
};

/* ---- GET /api/admin/dashboard ---- */
router.get('/dashboard', async (req, res) => {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const totalUsers      = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get().c;
  const suspendedUsers  = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user' AND status = 'suspended'").get().c;
  const activeUsers     = totalUsers - suspendedUsers;
  const onlineUsers     = getOnlineUserIds().size;
  const loggedInUsers   = db.prepare('SELECT COUNT(DISTINCT user_id) c FROM sessions WHERE expires_at > ?').get(now).c;

  const recentUsers = db.prepare(`
    SELECT id, email, role, status, created_at, last_login_at
    FROM users ORDER BY created_at DESC LIMIT 10
  `).all();

  const usageTotals = db.prepare(`
    SELECT COUNT(*) requests, COALESCE(SUM(total_tokens),0) totalTokens, COALESCE(AVG(duration_ms),0) avgDuration
    FROM usage_events
  `).get();

  const requestsLastMinute = db.prepare('SELECT COUNT(*) c FROM usage_events WHERE created_at > ?').get(oneMinuteAgo).c;
  const requestsLastDay    = db.prepare('SELECT COUNT(*) c FROM usage_events WHERE created_at > ?').get(oneDayAgo).c;

  const [ollamaHealth, sys] = await Promise.all([providers.checkHealth(), system.getSnapshot()]);
  const activeModel = db.prepare("SELECT value FROM app_settings WHERE key = 'active_model'").get()?.value;

  // The #1 cause of "shows connected but doesn't reply": the server
  // is reachable, but the specific model configured for chat was
  // never actually pulled there. Surface this explicitly rather
  // than letting it silently fail on every chat request.
  let modelWarning = null;
  if (ollamaHealth.ok && activeModel) {
    const modelCheck = await providers.checkActiveModelAvailable(activeModel);
    if (modelCheck.available === false) {
      modelWarning = `Active model "${activeModel}" is connected to the server but not installed there. Pull it, or pick an installed model in Model Control.`;
    }
  }

  res.json({
    totalUsers,
    activeUsers,
    suspendedUsers,
    onlineUsers,
    loggedInUsers,
    recentUsers,
    totalMessages: usageTotals.requests,
    totalTokens: usageTotals.totalTokens,
    avgResponseTimeMs: Math.round(usageTotals.avgDuration),
    requestsPerMinute: requestsLastMinute,
    requestsLast24h: requestsLastDay,
    ollamaConnected: ollamaHealth.ok,
    ollamaLatencyMs: ollamaHealth.ok ? ollamaHealth.latency : null,
    modelWarning,
    activeModel,
    system: sys,
    serverTime: now,
  });
});

/* ---- GET /api/admin/users — search, filter, paginate ---- */
router.get('/users', (req, res) => {
  const { search = '', status = '', role = '', page = '1' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;

  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('email LIKE ?');
    params.push(`%${String(search).slice(0, 100)}%`);
  }
  if (['active', 'suspended'].includes(status)) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (['user', 'admin'].includes(role)) {
    clauses.push('role = ?');
    params.push(role);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM users ${where}`).get(...params).c;
  const users = db.prepare(`
    SELECT id, email, role, status, created_at, last_login_at
    FROM users ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const onlineIds = getOnlineUserIds();

  const userIds = users.map((u) => u.id);
  const tokensByUser = {};
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',');
    db.prepare(`
      SELECT user_id, COALESCE(SUM(total_tokens),0) tokens, COUNT(*) messages
      FROM usage_events WHERE user_id IN (${placeholders}) GROUP BY user_id
    `).all(...userIds).forEach((r) => { tokensByUser[r.user_id] = { tokens: r.tokens, messages: r.messages }; });
  }

  res.json({
    users: users.map(u => ({
      ...u,
      online: onlineIds.has(u.id),
      totalTokens: tokensByUser[u.id]?.tokens || 0,
      totalMessages: tokensByUser[u.id]?.messages || 0,
    })),
    total,
    page: pageNum,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/* ---- POST /api/admin/users/:id/suspend ---- */
router.post('/users/:id/suspend', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(400).json({ error: 'Administrator accounts cannot be suspended here' });

  db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); // force logout everywhere
  res.json({ ok: true });
});

/* ---- POST /api/admin/users/:id/enable ---- */
router.post('/users/:id/enable', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);
  res.json({ ok: true });
});

/* ---- DELETE /api/admin/users/:id ---- */
router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(400).json({ error: 'Administrator accounts cannot be deleted here' });

  db.prepare('DELETE FROM users WHERE id = ?').run(id); // sessions cascade-delete
  res.json({ ok: true });
});

/* ---- GET /api/admin/users/export — CSV ---- */
router.get('/users/export', (req, res) => {
  const users = db.prepare(`
    SELECT id, email, role, status, created_at, last_login_at FROM users ORDER BY created_at ASC
  `).all();

  const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'id,email,role,status,created_at,last_login_at\n';
  const rows = users.map(u => [
    u.id,
    u.email,
    u.role,
    u.status,
    new Date(u.created_at).toISOString(),
    u.last_login_at ? new Date(u.last_login_at).toISOString() : '',
  ].map(escapeCsv).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="umranigpt-users.csv"');
  res.send(header + rows);
});

/* ---- POST /api/admin/users/:id/reset-conversations ----
   Chat history lives in the user's own browser (local-first by
   design), so the server can't delete it directly. Instead it
   stamps a timestamp the client compares on next session check
   and clears its own local history if newer than what it's
   already acknowledged. */
router.post('/users/:id/reset-conversations', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET reset_conversations_at = ? WHERE id = ?').run(Date.now(), id);
  res.json({ ok: true });
});

/* ---- POST /api/admin/users/:id/reset-tokens ---- */
router.post('/users/:id/reset-tokens', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM usage_events WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

/* ---- GET /api/admin/users/:id/memory ---- */
router.get('/users/:id/memory', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  res.json({ memoryEnabled: memory.ENABLED, ...memory.getMemorySummaryForAdmin(id) });
});

/* ---- POST /api/admin/users/:id/reset-memory ---- */
router.post('/users/:id/reset-memory', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  memory.resetMemory(id);
  res.json({ ok: true });
});

/* ---- Model control ---- */
router.get('/model', async (req, res) => {
  const activeModel = db.prepare("SELECT value FROM app_settings WHERE key = 'active_model'").get()?.value || 'tinyllama';
  try {
    const availableModels = await providers.listModels();
    const activeModelAvailable = availableModels.some(
      (m) => providers.normaliseModelName(m.name) === providers.normaliseModelName(activeModel)
    );
    res.json({ activeModel, availableModels, ollamaReachable: true, activeModelAvailable });
  } catch (err) {
    res.json({ activeModel, availableModels: [], ollamaReachable: false, activeModelAvailable: null, error: err.message });
  }
});

/* ---- POST /api/admin/model/test — the definitive diagnostic.
   Sends one real message through the active model and returns
   exactly what happened, using the SAME code path a real chat
   uses. This is what actually answers "why doesn't it reply?" —
   connectivity checks alone can't. ---- */
router.post('/model/test', async (req, res) => {
  const activeModel = db.prepare("SELECT value FROM app_settings WHERE key = 'active_model'").get()?.value || 'tinyllama';
  const result = await providers.testChat(activeModel);
  res.json({ model: activeModel, ...result });
});

router.put('/model', (req, res) => {
  const { model } = req.body || {};
  if (!model || typeof model !== 'string' || model.length > 200) {
    return res.status(400).json({ error: 'A valid model name is required' });
  }
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES ('active_model', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(model.trim());
  res.json({ ok: true, activeModel: model.trim() });
});

/* ---- System snapshot ---- */
router.get('/system', async (req, res) => {
  const [ollamaHealth, sys] = await Promise.all([providers.checkHealth(), system.getSnapshot()]);

  // Database file size
  const dbPath = require('path').join(__dirname, '..', '..', 'data', 'umranigpt.db');
  let dbSizeBytes = null;
  try {
    const { statSync } = require('fs');
    if (statSync(dbPath).isFile()) dbSizeBytes = statSync(dbPath).size;
  } catch { /* db not yet created */ }

  res.json({
    ollama: {
      connected:  ollamaHealth.ok,
      latencyMs:  ollamaHealth.ok ? ollamaHealth.latency : null,
      modelCount: ollamaHealth.modelCount ?? null,
      provider:   providers.getProviderInfo().label,
    },
    database: {
      sizeBytes:       dbSizeBytes,
      sizeFormatted:   dbSizeBytes != null ? formatBytes(dbSizeBytes) : 'Not created yet',
      totalUsers:      db.prepare('SELECT COUNT(*) c FROM users').get().c,
      totalSessions:   db.prepare('SELECT COUNT(*) c FROM sessions').get().c,
      totalMessages:   db.prepare('SELECT COUNT(*) c FROM usage_events').get().c,
      totalLogs:       db.prepare('SELECT COUNT(*) c FROM logs').get().c,
    },
    ...sys,
  });
});

const formatBytes = (b) => {
  if (!b) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/* ---- Logs ---- */
router.get('/logs', (req, res) => {
  const { level = '', page = '1' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 50;
  const offset = (pageNum - 1) * pageSize;

  const where = ['error', 'warning'].includes(level) ? 'WHERE level = ?' : '';
  const params = where ? [level] : [];

  const total = db.prepare(`SELECT COUNT(*) c FROM logs ${where}`).get(...params).c;
  const logs = db.prepare(`
    SELECT id, level, message, created_at FROM logs ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({ logs, total, page: pageNum, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get('/logs/export', (req, res) => {
  const logs = db.prepare('SELECT id, level, message, created_at FROM logs ORDER BY created_at ASC').all();
  const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'id,level,message,created_at\n';
  const rows = logs.map((l) => [l.id, l.level, l.message, new Date(l.created_at).toISOString()].map(escapeCsv).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="umranigpt-logs.csv"');
  res.send(header + rows);
});

/* ---- GET /api/admin/activity — for the live line chart ---- */
router.get('/activity', (req, res) => {
  const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24)); // cap at 7 days
  const snapshots = activity.getSnapshots(hours);
  res.json({
    hours,
    points: snapshots.map(s => ({
      t:        s.timestamp,
      online:   s.online_count,
      loggedIn: s.logged_in_count,
      requests: s.requests_since_last,
      live:     !!s.live,
    })),
  });
});

/* ---- GET /api/admin/activity/usage — token & request volume over time ---- */
router.get('/activity/usage', (req, res) => {
  const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
  res.json({ hours, points: activity.getUsageOverTime(hours) });
});

module.exports = router;
