/* ============================================================
   UMRANIGPT SERVER — OAuth Providers
   Google and Facebook only. Both are free for basic "sign in"
   use (no paid API tier involved). X/Twitter is deliberately
   not included — as of 2026 it no longer offers a free tier for
   its API, including OAuth login, so it's excluded on cost
   grounds rather than complexity.

   Standard Authorization Code flow, done with plain fetch — no
   extra dependency. Profile data is fetched directly from each
   provider's own server using the access token we receive
   server-side, so nothing client-supplied is trusted blindly.
============================================================ */
'use strict';

const crypto = require('crypto');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FACEBOOK_APP_ID      = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET  = process.env.FACEBOOK_APP_SECRET || '';

const isConfigured = {
  google: () => Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  facebook: () => Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET),
};

const generateState = () => crypto.randomBytes(24).toString('hex');

/* ---- Google ---- */
const google = {
  getAuthUrl: (redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  exchangeCode: async (code, redirectUri) => {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error('Google rejected the sign-in request');
    return res.json(); // { access_token, id_token, ... }
  },

  getProfile: async (accessToken) => {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Could not fetch Google profile');
    const data = await res.json();
    return {
      providerUserId: data.sub,
      email: data.email ? data.email.toLowerCase() : null,
      emailVerified: !!data.email_verified,
      name: data.name || null,
    };
  },
};

/* ---- Facebook ---- */
const FB_API_VERSION = 'v19.0';

const facebook = {
  getAuthUrl: (redirectUri, state) => {
    const params = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      state,
      scope: 'email public_profile',
      response_type: 'code',
    });
    return `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?${params.toString()}`;
  },

  exchangeCode: async (code, redirectUri) => {
    const params = new URLSearchParams({
      code,
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri: redirectUri,
    });
    const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token?${params.toString()}`);
    if (!res.ok) throw new Error('Facebook rejected the sign-in request');
    return res.json(); // { access_token, ... }
  },

  getProfile: async (accessToken) => {
    const params = new URLSearchParams({ fields: 'id,name,email', access_token: accessToken });
    const res = await fetch(`https://graph.facebook.com/me?${params.toString()}`);
    if (!res.ok) throw new Error('Could not fetch Facebook profile');
    const data = await res.json();
    return {
      providerUserId: data.id,
      // Facebook only returns email if the user granted it and has one
      // verified on their account — there's no separate "verified" flag,
      // Facebook itself only ever returns confirmed addresses.
      email: data.email ? data.email.toLowerCase() : null,
      emailVerified: !!data.email,
      name: data.name || null,
    };
  },
};

module.exports = { google, facebook, isConfigured, generateState };
