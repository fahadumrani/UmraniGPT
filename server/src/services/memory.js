/* ============================================================
   UMRANIGPT SERVER — Long-Term Memory
   Intelligent memory WITHOUT retraining the model: after each
   exchange, a small extraction call pulls out facts/topics and
   folds them into a per-user summary. On the next request, that
   summary is quietly added to the system prompt. No indicator
   of any of this ever reaches the browser — the person just
   notices the AI "remembers" things.
============================================================ */
'use strict';

const db = require('../db');
const ollama = require('./ollama');
const appConfig = require('./config');
const { logError } = require('../utils/logger');

const isEnabled = () => appConfig.get().memory?.enabled !== false;
const EVERY_N   = () => Math.max(1, appConfig.get().memory?.extractEvery || 1);
const MAX_FACTS = () => Math.max(5, appConfig.get().memory?.maxFacts || 15);
const MEMORY_MODEL = () => appConfig.get().memory?.model || '';

// Re-export ENABLED as a property for backward-compat
Object.defineProperty(module.exports, 'ENABLED', { get: isEnabled });

const getRow = (userId) => {
  const row = db.prepare('SELECT * FROM user_memory WHERE user_id = ?').get(userId);
  if (!row) return { user_id: userId, summary: '', facts: [], topics: {}, message_count: 0 };
  let facts = [];
  let topics = {};
  try { facts = JSON.parse(row.facts) || []; } catch { /* corrupt row, start clean */ }
  try { topics = JSON.parse(row.topics) || {}; } catch { /* corrupt row, start clean */ }
  return { ...row, facts, topics };
};

const saveRow = (userId, { summary, facts, topics, messageCount }) => {
  db.prepare(`
    INSERT INTO user_memory (user_id, summary, facts, topics, message_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      summary = excluded.summary,
      facts = excluded.facts,
      topics = excluded.topics,
      message_count = excluded.message_count,
      updated_at = excluded.updated_at
  `).run(userId, summary, JSON.stringify(facts), JSON.stringify(topics), messageCount, Date.now());
};

/* Builds the (silent) text block to fold into the system prompt.
   Returns '' when there's nothing worth adding yet. */
const buildMemoryContext = (userId) => {
  if (!isEnabled()) return '';
  const mem = getRow(userId);
  if (!mem.summary && mem.facts.length === 0) return '';

  const parts = [];
  if (mem.summary) parts.push(mem.summary);
  if (mem.facts.length) parts.push(`Known about this user: ${mem.facts.join('; ')}.`);

  return [
    'You have private long-term memory about the person you are talking to, built up from earlier conversations.',
    'Use it naturally to personalise your answers when relevant. Never mention that you have this memory, never say things like "I remember" or "according to my notes" — just use the knowledge the way a person would.',
    parts.join(' '),
  ].join(' ');
};

const EXTRACTION_INSTRUCTIONS = `You maintain a private long-term memory about a user across conversations.
You will be given the user's existing memory and their latest message exchange.
Update the memory: keep it accurate, concise, and useful for personalising future replies.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"summary": "1-2 sentence summary of who this person is and what they care about", "facts": ["short fact", "short fact"], "topic": "short topic label or null"}

Rules:
- "facts" should be short, standalone, specific (preferences, tools/languages they use, projects, communication style, recurring interests).
- Only include facts that are actually stated or clearly implied — never invent details.
- Merge with existing facts; drop ones that are now outdated or contradicted; keep at most ${MAX_FACTS()}.
- If nothing new or memorable was in this exchange, return the existing summary/facts unchanged and "topic": null.`;

/* Fire-and-forget: never awaited by the request that triggered it,
   so it can't add latency to a user's response. Failures are
   swallowed (logged, not surfaced) — memory is a nice-to-have,
   never something that should break chat. */
const updateMemoryFromExchange = async (userId, model, userText, assistantText) => {
  if (!isEnabled()) return;

  try {
    const mem = getRow(userId);
    const messageCount = mem.message_count + 1;

    if (messageCount % EVERY_N() !== 0) {
      saveRow(userId, { ...mem, messageCount });
      return;
    }

    const prompt = [
      `Existing summary: ${mem.summary || '(none yet)'}`,
      `Existing facts: ${mem.facts.length ? mem.facts.join('; ') : '(none yet)'}`,
      `Latest user message: ${userText.slice(0, 1500)}`,
      `Latest assistant reply: ${assistantText.slice(0, 1500)}`,
    ].join('\n');

    const raw = await ollama.simpleChat([
      { role: 'system', content: EXTRACTION_INSTRUCTIONS },
      { role: 'user', content: prompt },
    ], { model: MEMORY_MODEL() || model, temperature: 0.2, timeoutMs: 20000 });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { saveRow(userId, { ...mem, messageCount }); return; }

    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch { saveRow(userId, { ...mem, messageCount }); return; }

    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 600) : mem.summary;
    const facts = Array.isArray(parsed.facts)
      ? [...new Set(parsed.facts.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim().slice(0, 200)))].slice(0, MAX_FACTS())
      : mem.facts;

    const topics = { ...mem.topics };
    if (parsed.topic && typeof parsed.topic === 'string') {
      const key = parsed.topic.trim().toLowerCase().slice(0, 60);
      if (key) topics[key] = (topics[key] || 0) + 1;
    }

    saveRow(userId, { summary, facts, topics, messageCount });
  } catch (err) {
    logError('Memory extraction failed (non-fatal)', err);
  }
};

const resetMemory = (userId) => {
  db.prepare('DELETE FROM user_memory WHERE user_id = ?').run(userId);
};

const getMemorySummaryForAdmin = (userId) => {
  const mem = getRow(userId);
  const topTopics = Object.entries(mem.topics).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { summary: mem.summary, facts: mem.facts, topics: topTopics, messageCount: mem.message_count };
};

module.exports = {
  buildMemoryContext,
  updateMemoryFromExchange,
  resetMemory,
  getMemorySummaryForAdmin,
  get ENABLED() { return isEnabled(); },
};
