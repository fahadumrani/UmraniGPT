/* ============================================================
   UMRANIGPT SERVER — Auth Utilities
   Password hashing, session tokens, validation.
============================================================ */
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

/* ---- Passwords ---- */
const hashPassword = (plain) => bcrypt.hashSync(plain, SALT_ROUNDS);
const verifyPassword = (plain, hash) => {
  try { return bcrypt.compareSync(plain, hash); }
  catch { return false; }
};

/* ---- Session tokens ----
   The raw token goes in the cookie. Only its SHA-256 hash is stored
   in the database, so a database leak alone can't be used to log in. */
const generateSessionToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/* ---- Validation ---- */
const isValidEmail = (email) =>
  typeof email === 'string' &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const isValidPassword = (password) =>
  typeof password === 'string' &&
  password.length >= 8 &&
  password.length <= 200;

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  isValidEmail,
  isValidPassword,
};
