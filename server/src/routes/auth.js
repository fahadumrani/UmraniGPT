/* ============================================================
   UMRANIGPT SERVER — Auth Routes
   /api/auth/signup, /login, /logout, /me
============================================================ */
'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const {
  hashPassword, verifyPassword,
  generateSessionToken, hashToken,
  isValidEmail, isValidPassword,
} = require('../utils/auth');
const { SESSION_COOKIE, requireAuth } = require('../middleware/auth');
const { sessionCookie }               = require('../utils/cookies');

const router = express.Router();

const SESSION_TTL_HOURS          = Number(process.env.SESSION_TTL_HOURS || 24);
const SESSION_TTL_HOURS_REMEMBER = Number(process.env.SESSION_TTL_HOURS_REMEMBER || 720);

/* Limit brute-force / spam on auth endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

const createSession = (res, user, rememberMe, userAgent) => {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const ttlHours = rememberMe ? SESSION_TTL_HOURS_REMEMBER : SESSION_TTL_HOURS;
  const now = Date.now();
  const expiresAt = now + ttlHours * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, created_at, expires_at, remember_me, user_agent, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, tokenHash, now, expiresAt, rememberMe ? 1 : 0, userAgent || null, now);

  res.cookie(SESSION_COOKIE, token, sessionCookie(ttlHours * 60 * 60 * 1000));
};

/* ---- POST /api/auth/signup ---- */
router.post('/signup', authLimiter, (req, res) => {
  const { email, password } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalisedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalisedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = hashPassword(password);
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, role, status, created_at, last_login_at)
    VALUES (?, ?, 'user', 'active', ?, ?)
  `).run(normalisedEmail, passwordHash, now, now);

  const user = { id: info.lastInsertRowid, email: normalisedEmail, role: 'user' };
  createSession(res, user, false, req.get('user-agent'));

  res.status(201).json({ user: { email: user.email, role: user.role } });
});

/* ---- POST /api/auth/login ---- */
router.post('/login', authLimiter, (req, res) => {
  const { email, password, rememberMe } = req.body || {};

  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalisedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalisedEmail);

  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    if (user && !user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google or Facebook sign-in. Use one of those buttons instead.' });
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'This account has been suspended. Contact an administrator.' });
  }

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
  createSession(res, user, !!rememberMe, req.get('user-agent'));

  res.json({ user: { email: user.email, role: user.role } });
});

/* ---- POST /api/auth/logout ---- */
router.post('/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  // Must include same SameSite/Secure as when the cookie was set,
  // otherwise the browser won't actually clear the cross-origin cookie.
  const { SECURE, SAME_SITE } = require('../utils/cookies');
  res.clearCookie(SESSION_COOKIE, { path: '/', secure: SECURE, sameSite: SAME_SITE });
  res.json({ ok: true });
});

/* ---- GET /api/auth/me ---- (session restore / auto-login) */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { email: req.session.email, role: req.session.role, resetConversationsAt: req.session.reset_conversations_at || null } });
});

module.exports = router;
