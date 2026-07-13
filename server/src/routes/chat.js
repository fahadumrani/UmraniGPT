/* ============================================================
   UMRANIGPT SERVER — Chat Routes
   All chat requests route through the provider manager.
   Generation params come from app.json (admin-controlled)
   except temperature which users can adjust.
============================================================ */
'use strict';

const express    = require('express');
const db         = require('../db');
const providers  = require('../services/providers');
const appConfig  = require('../services/config');
const memory     = require('../services/memory');
const langdetect = require('../utils/langdetect');
const { requireAuth } = require('../middleware/auth');
const { logError }    = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

const getActiveModel = () => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'active_model'").get();
  const cfg  = appConfig.get();
  return row?.value || cfg.defaultModel || 'tinyllama';
};

const clampTemperature = (value, defaultTemp) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultTemp;
  return Math.min(2, Math.max(0, n));
};

const sanitiseMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === 'string' && ['user','assistant','system'].includes(m.role))
    .slice(-50)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 32000),
      ...(Array.isArray(m.images) ? { images: m.images.slice(0, 4) } : {}),
    }));
};

const recordUsage = (userId, model, stats) => {
  try {
    db.prepare(`
      INSERT INTO usage_events (user_id,model,prompt_tokens,completion_tokens,total_tokens,duration_ms,created_at)
      VALUES (?,?,?,?,?,?,?)
    `).run(userId, model,
      stats.promptTokens || 0, stats.completionTokens || 0,
      stats.totalTokens || 0, stats.durationMs || 0, Date.now());
  } catch (err) { logError('Failed to record usage event', err); }
};

/* ---- POST /api/chat ---- */
router.post('/', (req, res) => {
  const messages = sanitiseMessages(req.body?.messages);
  if (!messages.length) return res.status(400).json({ error: 'No message content provided' });

  const cfg   = appConfig.get();
  const gen   = cfg.generation || {};
  const model = getActiveModel();
  const temperature = clampTemperature(req.body?.temperature, gen.temperature ?? 0.7);
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  const memoryContext = memory.buildMemoryContext(req.session.user_id);
  const userSystemPrompt = typeof req.body?.userSystemPrompt === 'string'
    ? req.body.userSystemPrompt.slice(0, 2000)
    : '';

  // Auto-detect language from the latest user message and add a silent instruction
  const langInstruction = lastUserMessage
    ? langdetect.buildLanguageInstruction(langdetect.detect(lastUserMessage.content))
    : '';

  const systemPrompt = [
    cfg.system?.systemPrompt || '',
    userSystemPrompt,
    langInstruction,
    memoryContext,
  ].filter(Boolean).join('\n\n');

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const abortController = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abortController.abort(); });

  const write    = (obj) => { try { res.write(JSON.stringify(obj) + '\n'); } catch { /* stream closed */ } };
  const startedAt = Date.now();
  let assistantText = '';

  providers.chatStream(messages, {
    model,
    temperature,
    systemPrompt,
    generation: {
      top_p:        gen.topP ?? 0.9,
      top_k:        gen.topK ?? 40,
      repeat_penalty: gen.repeatPenalty ?? 1.1,
      num_ctx:      gen.contextLength ?? 4096,
      maxTokens:    gen.maxTokens ?? 8192,
      seed:         gen.seed ?? -1,
    },
  }, {
    signal: abortController.signal,
    onChunk: (content) => {
      assistantText += content;
      write({ model, message: { role: 'assistant', content }, done: false });
    },
    onDone: (stats) => {
      if (!stats.aborted) {
        recordUsage(req.session.user_id, stats.model || model, {
          ...stats, durationMs: stats.durationMs || (Date.now() - startedAt),
        });
        if (lastUserMessage && assistantText) {
          memory.updateMemoryFromExchange(
            req.session.user_id, stats.model || model,
            lastUserMessage.content, assistantText,
          ).catch(() => {});
        }
      }
      write({
        model: stats.model || model,
        done: true,
        prompt_eval_count: stats.promptTokens || 0,
        eval_count: stats.completionTokens || 0,
        total_duration: (stats.durationMs || (Date.now() - startedAt)) * 1e6,
      });
      res.end();
    },
    onError: (err) => {
      logError('Chat stream error', err);
      write({ error: 'The AI server had a problem generating a response. Please try again.' });
      res.end();
    },
  });
});

/* ---- GET /api/chat/status ---- */
router.get('/status', async (req, res) => {
  const health = await providers.checkHealth();
  const info   = providers.getProviderInfo();
  res.json({
    status:  health.ok ? 'connected' : 'offline',
    latency: health.ok ? health.latency : null,
    provider: info.label,
  });
});

module.exports = router;
