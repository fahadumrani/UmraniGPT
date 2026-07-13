/* ============================================================
   UMRANIGPT SERVER — Database
   SQLite via better-sqlite3. Synchronous, file-based, zero setup.
============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'umranigpt.db');

/* ------------------------------------------------------------
   Driver selection.
   Preferred: better-sqlite3 (fast native binding, works on any
   Node version, installed from package.json).
   Fallback:  node:sqlite — Node's own built-in SQLite (Node 22.5+,
   zero install). Used automatically only if better-sqlite3's
   native build didn't succeed on this machine, so a one-off
   environment quirk during `npm install` can't take the whole
   server down.
------------------------------------------------------------ */
let db;

try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
} catch (primaryErr) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    console.error('[UmraniGPT] Could not load a SQLite driver.');
    console.error('[UmraniGPT] "better-sqlite3" failed to load, and this Node version has no built-in node:sqlite.');
    console.error('[UmraniGPT] Fix: re-run "npm install" with internet access, or use Node 22.5+.');
    throw primaryErr;
  }

  console.warn('[UmraniGPT] better-sqlite3 native build unavailable on this machine — using Node\'s built-in SQLite instead.');
  console.warn('[UmraniGPT] Everything works the same; run "npm install" again later to switch back to better-sqlite3.');

  const native = new DatabaseSync(DB_PATH);
  native.exec('PRAGMA journal_mode = WAL');

  // Thin shim so the rest of the app can use one consistent API
  // regardless of which driver ended up loading.
  db = {
    pragma: (stmt) => native.exec(`PRAGMA ${stmt}`),
    exec: (sql) => native.exec(sql),
    prepare: (sql) => {
      const stmt = native.prepare(sql);
      return {
        run: (...params) => stmt.run(...params),
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
      };
    },
  };
}

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT,
    role           TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
    created_at     INTEGER NOT NULL,
    last_login_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash     TEXT NOT NULL UNIQUE,
    created_at     INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    remember_me    INTEGER NOT NULL DEFAULT 0,
    user_agent     TEXT,
    last_seen_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model             TEXT,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens      INTEGER NOT NULL DEFAULT 0,
    duration_ms       INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT NOT NULL CHECK(level IN ('error','warning')),
    message    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL CHECK(provider IN ('google','facebook')),
    provider_user_id  TEXT NOT NULL,
    created_at        INTEGER NOT NULL,
    UNIQUE(provider, provider_user_id)
  );

  CREATE TABLE IF NOT EXISTS user_memory (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    summary        TEXT NOT NULL DEFAULT '',
    facts          TEXT NOT NULL DEFAULT '[]',
    topics         TEXT NOT NULL DEFAULT '{}',
    message_count  INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     INTEGER NOT NULL,
    online_count  INTEGER NOT NULL DEFAULT 0,
    logged_in_count INTEGER NOT NULL DEFAULT 0,
    requests_since_last INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_last_seen   ON sessions(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_status         ON users(status);
  CREATE INDEX IF NOT EXISTS idx_usage_user_id        ON usage_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_usage_created_at      ON usage_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_usage_user_created     ON usage_events(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_logs_created_at        ON logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_logs_level              ON logs(level);
  CREATE INDEX IF NOT EXISTS idx_oauth_user_id           ON oauth_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_timestamp        ON activity_snapshots(timestamp);
`);

/* Seed default active model if not already set. */
const existingModel = db.prepare("SELECT value FROM app_settings WHERE key = 'active_model'").get();
if (!existingModel) {
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('active_model', ?)").run(process.env.DEFAULT_MODEL || 'tinyllama');
}

/* Migration: add reset_conversations_at to users table if it doesn't
   exist yet (safe to run repeatedly; needed for installs upgraded
   from an earlier version of this schema). */
const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((c) => c.name === 'reset_conversations_at')) {
  db.exec('ALTER TABLE users ADD COLUMN reset_conversations_at INTEGER');
}

/* Migration: password_hash used to be NOT NULL (before OAuth accounts
   existed, which have no local password). SQLite can't drop a NOT
   NULL constraint with ALTER TABLE, so rebuild the table the
   standard SQLite way when an older database is detected. Safe to
   run repeatedly — it's a no-op once already migrated. */
const passwordCol = userColumns.find((c) => c.name === 'password_hash');
if (passwordCol && passwordCol.notnull) {
  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE users_migrating (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        email          TEXT UNIQUE NOT NULL,
        password_hash  TEXT,
        role           TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
        status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
        created_at     INTEGER NOT NULL,
        last_login_at  INTEGER,
        reset_conversations_at INTEGER
      );
      INSERT INTO users_migrating (id, email, password_hash, role, status, created_at, last_login_at, reset_conversations_at)
        SELECT id, email, password_hash, role, status, created_at, last_login_at, reset_conversations_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrating RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    db.exec('COMMIT');
    console.log('[UmraniGPT] Database migrated to support social login (password is now optional per account).');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = db;
