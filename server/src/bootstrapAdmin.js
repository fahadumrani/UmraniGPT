/* ============================================================
   UMRANIGPT SERVER — Admin Bootstrap
   Creates the first administrator account from .env on startup,
   so there's a way into admin.html without a chicken-and-egg
   problem. Only runs while zero admin accounts exist.
============================================================ */
'use strict';

const db = require('./db');
const { hashPassword, isValidEmail, isValidPassword } = require('./utils/auth');

const bootstrapAdmin = () => {
  const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
  if (adminCount > 0) return;

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.warn('[UmraniGPT] No administrator account exists yet.');
    console.warn('[UmraniGPT] Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env and restart to create one.');
    return;
  }
  if (!isValidEmail(email) || !isValidPassword(password)) {
    console.warn('[UmraniGPT] ADMIN_EMAIL/ADMIN_PASSWORD in .env are invalid (password needs 8+ characters).');
    console.warn('[UmraniGPT] Administrator account was not created.');
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  if (existing) {
    db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(existing.id);
    console.log(`[UmraniGPT] Existing account "${email}" promoted to administrator.`);
    return;
  }

  const passwordHash = hashPassword(password);
  db.prepare(`
    INSERT INTO users (email, password_hash, role, status, created_at)
    VALUES (?, ?, 'admin', 'active', ?)
  `).run(email, passwordHash, Date.now());

  console.log(`[UmraniGPT] Administrator account created: ${email}`);
  console.log('[UmraniGPT] Sign in at login.html, then open admin.html directly. Change the password after first login.');
};

module.exports = bootstrapAdmin;
