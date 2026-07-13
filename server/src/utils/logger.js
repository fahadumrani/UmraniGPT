/* ============================================================
   UMRANIGPT SERVER — Logger
   Prints to console as usual, and also persists error/warning
   entries so the admin dashboard can show and export them.
============================================================ */
'use strict';

const db = require('../db');

const MAX_MESSAGE_LENGTH = 2000;

const insertStmt = db.prepare(`
  INSERT INTO logs (level, message, created_at) VALUES (?, ?, ?)
`);

const record = (level, message) => {
  try {
    insertStmt.run(level, String(message).slice(0, MAX_MESSAGE_LENGTH), Date.now());
  } catch {
    /* logging must never crash the app */
  }
};

const logError = (message, err) => {
  const full = err ? `${message}: ${err.message || err}` : message;
  console.error(`[UmraniGPT] ${full}`);
  record('error', full);
};

const logWarning = (message) => {
  console.warn(`[UmraniGPT] ${message}`);
  record('warning', message);
};

/* Keep the table from growing forever on a long-running server. */
const pruneOldLogs = (keepDays = 30) => {
  try {
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM logs WHERE created_at < ?').run(cutoff);
  } catch { /* non-fatal */ }
};

module.exports = { logError, logWarning, pruneOldLogs };
