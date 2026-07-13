/* ============================================================
   UMRANIGPT SERVER — Auth Middleware
============================================================ */
'use strict';

const db = require('../db');
const { hashToken } = require('../utils/auth');

const SESSION_COOKIE = 'umrani_session';

/* Consider a session "active" for online/offline tracking if it made
   a request within this window. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const getSessionFromRequest = (req) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = db.prepare(`
    SELECT sessions.id, sessions.user_id, sessions.expires_at, sessions.last_seen_at,
           users.email, users.role, users.status, users.reset_conversations_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).get(tokenHash);

  if (!session) return null;

  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return null;
  }
  if (session.status === 'suspended') return null;

  // Throttle the write — only touch last_seen_at once a minute per session.
  if (Date.now() - session.last_seen_at > 60000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), session.id);
  }

  return session;
};

/* Attach req.session (or null) for every request, without blocking it. */
const attachUser = (req, res, next) => {
  req.session = getSessionFromRequest(req);
  next();
};

const requireAuth = (req, res, next) => {
  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  next();
};

const requireAdmin = (req, res, next) => {
  const apiKey = process.env.BACKEND_API_KEY;
  if (apiKey && req.get('X-API-Key') === apiKey) return next(); // script/automation access

  if (!req.session) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
  next();
};

module.exports = {
  SESSION_COOKIE,
  ONLINE_WINDOW_MS,
  getSessionFromRequest,
  attachUser,
  requireAuth,
  requireAdmin,
};
