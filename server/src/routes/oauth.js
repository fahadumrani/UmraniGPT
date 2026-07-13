/* ============================================================
   UMRANIGPT SERVER — OAuth Routes
   /api/auth/google, /api/auth/facebook (+ /callback each)
============================================================ */
'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const oauth = require('../services/oauth');
const { generateSessionToken, hashToken } = require('../utils/auth');
const { SESSION_COOKIE } = require('../middleware/auth');
const { sessionCookie, oauthStateCookie } = require('../utils/cookies');
const { logError } = require('../utils/logger');

const router = express.Router();

const STATE_COOKIE      = 'umrani_oauth_state';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);
const FRONTEND_URL      = (process.env.FRONTEND_URL  || '').replace(/\/+$/, '');
const CALLBACK_BASE     = (process.env.OAUTH_CALLBACK_BASE_URL || '').replace(/\/+$/, '');

const oauthLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const redirectUriFor = (provider) => `${CALLBACK_BASE}/api/auth/${provider}/callback`;

const failureRedirect = (reason) => `${FRONTEND_URL}/login.html?error=${encodeURIComponent(reason)}`;

/* Finds a user linked to this provider identity, links an existing
   account by verified email, or creates a brand-new user. Never
   trusts an unverified email for linking, to avoid account takeover. */
const findOrCreateOAuthUser = (provider, profile) => {
  const existingLink = db.prepare(`
    SELECT users.* FROM oauth_accounts
    JOIN users ON users.id = oauth_accounts.user_id
    WHERE oauth_accounts.provider = ? AND oauth_accounts.provider_user_id = ?
  `).get(provider, profile.providerUserId);

  if (existingLink) return existingLink;

  let user = null;
  if (profile.email && profile.emailVerified) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email);
  }

  const now = Date.now();

  if (!user) {
    if (!profile.email) throw new Error('This account did not share an email address, so we cannot create a UmraniGPT account for it.');
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, role, status, created_at, last_login_at)
      VALUES (?, NULL, 'user', 'active', ?, ?)
    `).run(profile.email, now, now);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }

  if (user.status === 'suspended') throw new Error('This account has been suspended.');

  db.prepare(`
    INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_user_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, provider, profile.providerUserId, now);

  return user;
};

const createSessionAndRedirect = (res, user) => {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_HOURS * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, created_at, expires_at, remember_me, last_seen_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(user.id, tokenHash, now, expiresAt, now);

  res.cookie(SESSION_COOKIE, token, sessionCookie(SESSION_TTL_HOURS * 60 * 60 * 1000));
  res.redirect(`${FRONTEND_URL}/index.html`);
};

const buildProviderRoutes = (provider, client) => {
  router.get(`/${provider}`, oauthLimiter, (req, res) => {
    if (!oauth.isConfigured[provider]()) {
      return res.redirect(failureRedirect('not_configured'));
    }
    if (!CALLBACK_BASE || !FRONTEND_URL) {
      return res.redirect(failureRedirect('server_not_configured'));
    }
    const state = oauth.generateState();
    res.cookie(STATE_COOKIE, state, oauthStateCookie());
    res.redirect(client.getAuthUrl(redirectUriFor(provider), state));
  });

  router.get(`/${provider}/callback`, oauthLimiter, async (req, res) => {
    const { code, state, error: providerError } = req.query;
    const expectedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, oauthStateCookie());

    if (providerError) return res.redirect(failureRedirect('access_denied'));
    if (!code || !state || !expectedState || state !== expectedState) {
      return res.redirect(failureRedirect('invalid_state'));
    }

    try {
      const tokenData = await client.exchangeCode(code, redirectUriFor(provider));
      if (!tokenData.access_token) throw new Error('No access token returned');
      const profile = await client.getProfile(tokenData.access_token);
      const user = findOrCreateOAuthUser(provider, profile);
      createSessionAndRedirect(res, user);
    } catch (err) {
      logError(`OAuth (${provider}) sign-in failed`, err);
      res.redirect(failureRedirect('sign_in_failed'));
    }
  });
};

buildProviderRoutes('google', oauth.google);
buildProviderRoutes('facebook', oauth.facebook);

/* Lets the frontend know which provider buttons to actually show,
   without exposing client secrets. */
router.get('/providers', (req, res) => {
  res.json({
    google: oauth.isConfigured.google(),
    facebook: oauth.isConfigured.facebook(),
  });
});

module.exports = router;
