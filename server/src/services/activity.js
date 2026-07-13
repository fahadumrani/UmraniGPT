/* ============================================================
   UMRANIGPT SERVER — Activity Snapshot Service
   Records how many users are online / logged in at regular
   intervals, so the admin dashboard can show a genuine
   historical line chart — not just a single current number.
============================================================ */
'use strict';

const db = require('../db');
const { ONLINE_WINDOW_MS } = require('../middleware/auth');
const { logError } = require('../utils/logger');

const RETENTION_DAYS = Number(process.env.ACTIVITY_RETENTION_DAYS || 14);

/* Same "online" definition used everywhere else in the admin API,
   kept in one place so the chart and the live stat card always agree. */
const getCurrentCounts = () => {
  const now = Date.now();

  const onlineCount = db.prepare(`
    SELECT COUNT(DISTINCT user_id) c FROM sessions
    WHERE expires_at > ? AND last_seen_at > ?
  `).get(now, now - ONLINE_WINDOW_MS).c;

  const loggedInCount = db.prepare(`
    SELECT COUNT(DISTINCT user_id) c FROM sessions WHERE expires_at > ?
  `).get(now).c;

  return { onlineCount, loggedInCount };
};

/* Requests (chat messages) since the last snapshot — gives the
   chart a secondary signal beyond just "how many are online". */
let _lastSnapshotAt = Date.now();

const recordSnapshot = () => {
  try {
    const now = Date.now();
    const { onlineCount, loggedInCount } = getCurrentCounts();

    const requestsSinceLast = db.prepare(`
      SELECT COUNT(*) c FROM usage_events WHERE created_at > ? AND created_at <= ?
    `).get(_lastSnapshotAt, now).c;

    db.prepare(`
      INSERT INTO activity_snapshots (timestamp, online_count, logged_in_count, requests_since_last)
      VALUES (?, ?, ?, ?)
    `).run(now, onlineCount, loggedInCount, requestsSinceLast);

    _lastSnapshotAt = now;

    // Prune old snapshots so this table never grows unbounded
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM activity_snapshots WHERE timestamp < ?').run(cutoff);
  } catch (err) {
    logError('Activity snapshot failed (non-fatal)', err);
  }
};

/* Returns snapshots for charting, for the last N hours.
   Always includes a synthetic "right now" point at the end so the
   chart genuinely feels live between the fixed snapshot intervals. */
const getSnapshots = (hours = 24) => {
  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;

  const rows = db.prepare(`
    SELECT timestamp, online_count, logged_in_count, requests_since_last
    FROM activity_snapshots
    WHERE timestamp >= ?
    ORDER BY timestamp ASC
  `).all(since);

  const { onlineCount, loggedInCount } = getCurrentCounts();
  rows.push({ timestamp: now, online_count: onlineCount, logged_in_count: loggedInCount, requests_since_last: 0, live: true });

  return rows;
};

let _intervalHandle = null;

/* Call once at server startup. Records an immediate snapshot, then
   every INTERVAL_MS after that. */
const start = (intervalMs = 5 * 60 * 1000) => {
  recordSnapshot(); // immediate first point so the chart isn't empty
  if (_intervalHandle) clearInterval(_intervalHandle);
  _intervalHandle = setInterval(recordSnapshot, intervalMs);
  return _intervalHandle;
};

const stop = () => { if (_intervalHandle) clearInterval(_intervalHandle); _intervalHandle = null; };

/* ============================================================
   Token / request usage over time — for the second dashboard
   chart. Unlike online-user counts, usage_events already has a
   timestamp on every row, so this buckets the existing history
   directly rather than needing a snapshot table.
============================================================ */

/* Pick a bucket size that keeps the number of chart points
   reasonable regardless of the requested range. */
const bucketSizeMsFor = (hours) => {
  if (hours <= 6)   return 15 * 60 * 1000;        // 15 min buckets
  if (hours <= 24)  return 60 * 60 * 1000;        // 1 hour buckets
  if (hours <= 72)  return 3 * 60 * 60 * 1000;    // 3 hour buckets
  return 6 * 60 * 60 * 1000;                       // 6 hour buckets (7 day view)
};

const getUsageOverTime = (hours = 24) => {
  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;
  const bucketMs = bucketSizeMsFor(hours);

  const rows = db.prepare(`
    SELECT
      CAST(created_at / ?  AS INTEGER) * ? AS bucket,
      COUNT(*)                              AS requests,
      COALESCE(SUM(total_tokens), 0)        AS tokens,
      COALESCE(AVG(duration_ms), 0)         AS avgDurationMs
    FROM usage_events
    WHERE created_at >= ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(bucketMs, bucketMs, since);

  return rows.map(r => ({
    t: r.bucket,
    requests: r.requests,
    tokens: r.tokens,
    avgDurationMs: Math.round(r.avgDurationMs),
  }));
};

module.exports = { start, stop, recordSnapshot, getSnapshots, getCurrentCounts, getUsageOverTime };
