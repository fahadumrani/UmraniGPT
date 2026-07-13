/* ============================================================
   UMRANIGPT SERVER — Cookie Configuration
   Single source of truth for all cookie settings.

   WHY THIS FILE EXISTS:
   Cross-origin cookies between GitHub Pages and a Cloudflare
   Tunnel require EXACTLY:
     SameSite=None  — without this the browser won't send the
                      cookie in cross-origin fetch() calls.
     Secure=true    — required whenever SameSite=None is set.
                      Cloudflare Tunnel provides HTTPS, so this
                      is always true in that setup.

   The old logic `secure: NODE_ENV === 'production'` broke
   because devs run NODE_ENV=development locally but expose
   the server through a Cloudflare Tunnel (HTTPS), making
   the browser silently drop the non-Secure cookie.

   SETUP:
   In server/.env set:
     COOKIE_SECURE=true        ← always true behind Cloudflare
     COOKIE_SAME_SITE=none     ← required for cross-origin

   For purely local testing (same origin, no tunnel):
     COOKIE_SECURE=false
     COOKIE_SAME_SITE=lax
============================================================ */
'use strict';

const _secure   = process.env.COOKIE_SECURE;
const _sameSite = process.env.COOKIE_SAME_SITE;

/* If env var is not set, default to cross-origin-safe settings
   so that Cloudflare Tunnel setups work out of the box. */
const SECURE    = _secure   !== undefined ? _secure   !== 'false' : true;
const SAME_SITE = _sameSite !== undefined ? _sameSite : 'none';

/* SameSite=None requires Secure=true per spec — enforce this
   so a misconfigured .env doesn't produce invalid cookies. */
const resolvedSecure   = (SAME_SITE === 'none') ? true : SECURE;
const resolvedSameSite = SAME_SITE;

if (SAME_SITE === 'none' && !resolvedSecure) {
  console.warn('[UmraniGPT] COOKIE_SAME_SITE=none requires COOKIE_SECURE=true. Forcing secure=true.');
}

/**
 * Returns cookie options for the session cookie.
 * @param {number} maxAgeMs
 */
const sessionCookie = (maxAgeMs) => ({
  httpOnly:  true,
  secure:    resolvedSecure,
  sameSite:  resolvedSameSite,
  maxAge:    maxAgeMs,
  path:      '/',
});

/**
 * Returns cookie options for the short-lived OAuth state cookie.
 * This cookie must survive the browser redirect to/from the OAuth
 * provider — sameSite='lax' is correct here (redirect-based).
 */
const oauthStateCookie = () => ({
  httpOnly:  true,
  secure:    resolvedSecure,
  sameSite:  'lax',          // redirect flow — lax is fine
  maxAge:    5 * 60 * 1000,  // 5 minutes
  path:      '/',
});

const logCookieConfig = () => {
  console.log(`[UmraniGPT] Cookie config: secure=${resolvedSecure}, sameSite=${resolvedSameSite}`);
  if (resolvedSameSite !== 'none' || !resolvedSecure) {
    console.warn('[UmraniGPT] ⚠️  Non-cross-origin cookie config detected.');
    console.warn('[UmraniGPT]    If your frontend is on GitHub Pages + backend on Cloudflare Tunnel,');
    console.warn('[UmraniGPT]    add these to server/.env:');
    console.warn('[UmraniGPT]      COOKIE_SECURE=true');
    console.warn('[UmraniGPT]      COOKIE_SAME_SITE=none');
    console.warn('[UmraniGPT]    and add your GitHub Pages URL to FRONTEND_ORIGINS.');
  }
};

module.exports = { sessionCookie, oauthStateCookie, logCookieConfig, SECURE: resolvedSecure, SAME_SITE: resolvedSameSite };
