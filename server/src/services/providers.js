/* ============================================================
   UMRANIGPT SERVER — AI Provider Manager
   Routes chat requests to the configured AI provider.
   Supported:
     - ollama       (local Ollama server)
     - openai_compat (LM Studio, vLLM, LocalAI, etc.)
   Future providers (OpenAI, Anthropic, Gemini, Groq,
   OpenRouter) can be added by implementing the same interface
   and adding a case to chatStream / checkHealth / listModels.
============================================================ */
'use strict';

const appConfig = require('./config');
const { logError } = require('../utils/logger');
const ollama = require('./ollama');

const fetchWithTimeout = async (url, opts = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/* ============================================================
   OpenAI-compatible provider (LM Studio, vLLM, LocalAI, etc.)
   Uses the standard /v1/chat/completions endpoint with
   streaming = true. The response is text/event-stream SSE
   with data: {…} lines, same as real OpenAI.
============================================================ */
const openaiCompat = {
  checkHealth: async () => {
    const cfg = appConfig.get().providers.openai_compat;
    const base = cfg.url.replace(/\/+$/, '');
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(`${base}/models`, {
        headers: { ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      }, 5000);
      if (!res.ok) return { ok: false, latency: Date.now() - start };
      const data = await res.json();
      return { ok: true, latency: Date.now() - start, modelCount: (data.data || []).length };
    } catch {
      return { ok: false, latency: Date.now() - start };
    }
  },

  listModels: async () => {
    const cfg = appConfig.get().providers.openai_compat;
    const base = cfg.url.replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${base}/models`, {
      headers: { ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    }, 8000);
    if (!res.ok) throw new Error(`Provider returned ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m) => ({
      name: m.id,
      size: null,
      parameterSize: null,
      quantization: null,
      modifiedAt: m.created ? new Date(m.created * 1000).toISOString() : null,
    }));
  },

  chatStream: async (messages, options, { onChunk, onDone, onError, signal }) => {
    const cfg  = appConfig.get().providers.openai_compat;
    const gen  = options.generation || {};
    const base = cfg.url.replace(/\/+$/, '');

    const body = {
      model: options.model,
      messages: options.systemPrompt && !messages.some((m) => m.role === 'system')
        ? [{ role: 'system', content: options.systemPrompt }, ...messages]
        : messages,
      stream: true,
      temperature: options.temperature,
      top_p: gen.top_p,
      max_tokens: gen.maxTokens || 8192,
      ...(gen.seed >= 0 ? { seed: gen.seed } : {}),
    };

    let res;
    const CONNECT_TIMEOUT_MS = Number(process.env.CHAT_CONNECT_TIMEOUT_MS || 120000);
    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), CONNECT_TIMEOUT_MS);
    const combinedSignal = (signal && typeof AbortSignal.any === 'function')
      ? AbortSignal.any([signal, timeoutController.signal])
      : (signal || timeoutController.signal);

    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (err) {
      clearTimeout(timeoutTimer);
      if (err.name === 'AbortError' && timeoutController.signal.aborted && !signal?.aborted) {
        onError(new Error(`${cfg.label || 'AI provider'} took too long to respond (>${Math.round(CONNECT_TIMEOUT_MS / 1000)}s).`));
      } else if (err.name === 'AbortError') {
        onDone({ aborted: true, model: options.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 });
      } else {
        onError(new Error(`Could not reach ${cfg.label || 'AI provider'}.`));
      }
      return;
    }
    clearTimeout(timeoutTimer);

    if (!res.ok || !res.body) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch { /* ignore */ }
      onError(new Error(detail || `AI provider returned ${res.status}`));
      return;
    }

    let completionTokens = 0;
    let promptTokens = 0;
    let sawAnyChunk = false;
    let buffer = '';
    const decoder = new TextDecoder('utf-8');

    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line || line === 'data: [DONE]') continue;
          const jsonStr = line.startsWith('data: ') ? line.slice(6) : line;
          if (!jsonStr) continue;

          let data;
          try { data = JSON.parse(jsonStr); } catch { continue; }

          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            sawAnyChunk = true;
            onChunk(content);
          }

          if (data.choices?.[0]?.finish_reason) {
            promptTokens    = data.usage?.prompt_tokens || 0;
            completionTokens = data.usage?.completion_tokens || 0;
            onDone({
              model: options.model,
              promptTokens,
              completionTokens,
              totalTokens: (promptTokens + completionTokens) || 0,
              durationMs: 0,
            });
            return;
          }
        }
      }
      if (sawAnyChunk) {
        onDone({ model: options.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 });
      } else {
        onError(new Error('AI provider closed the connection without sending a response.'));
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        onDone({ aborted: true, model: options.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 });
        return;
      }
      logError('OpenAI-compat stream error', err);
      onError(err);
    }
  },
};

/* ============================================================
   Public interface — all callers use these, never the
   individual provider implementations directly.
============================================================ */

const getActiveProvider = () => appConfig.get().provider;

const checkHealth = async () => {
  const provider = getActiveProvider();
  try {
    if (provider === 'openai_compat') return await openaiCompat.checkHealth();
    return await ollama.checkHealth(); // default
  } catch {
    return { ok: false, latency: 0 };
  }
};

const listModels = async () => {
  const provider = getActiveProvider();
  if (provider === 'openai_compat') return openaiCompat.listModels();
  return ollama.listModels();
};

const chatStream = (messages, options, callbacks) => {
  const provider = getActiveProvider();
  if (provider === 'openai_compat') return openaiCompat.chatStream(messages, options, callbacks);
  return ollama.chatStream(messages, options, callbacks);
};

const simpleChat = async (messages, opts) => {
  const provider = getActiveProvider();
  if (provider === 'openai_compat') {
    const cfg  = appConfig.get().providers.openai_compat;
    const base = cfg.url.replace(/\/+$/, '');
    const res  = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model: opts.model, messages, stream: false, temperature: opts.temperature || 0.3 }),
    });
    if (!res.ok) throw new Error(`Provider returned ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  return ollama.simpleChat(messages, opts);
};

const getProviderInfo = () => {
  const cfg = appConfig.get();
  const provider = cfg.provider;
  const providerCfg = cfg.providers[provider] || {};
  return {
    active: provider,
    label: providerCfg.label || provider,
    enabled: providerCfg.enabled !== false,
    allProviders: Object.entries(cfg.providers).map(([id, p]) => ({
      id,
      label: p.label || id,
      enabled: p.enabled !== false,
    })),
  };
};

/* Ollama treats "llama3" and "llama3:latest" as the same model, but
   a naive string comparison wouldn't — normalise both sides before
   comparing so the availability check doesn't produce false
   negatives for models pulled without an explicit tag. */
const normaliseModelName = (name) => {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  return trimmed.endsWith(':latest') ? trimmed.slice(0, -':latest'.length) : trimmed;
};

/* THE most common cause of "shows connected but doesn't reply":
   the health check only confirms the AI server itself is reachable
   — it says nothing about whether the SPECIFIC model configured for
   chat is actually installed there. This checks that directly. */
const checkActiveModelAvailable = async (activeModel) => {
  try {
    const models = await listModels();
    const target = normaliseModelName(activeModel);
    const found = models.some((m) => normaliseModelName(m.name) === target);
    return { available: found, installedModels: models.map((m) => m.name) };
  } catch (err) {
    return { available: null, error: err.message, installedModels: [] }; // null = couldn't even check
  }
};

/* Sends one tiny real message through the active model and returns
   exactly what happened — the definitive test, since it's the exact
   code path a real chat uses. Used by admin.html's "Test Model"
   button so a failure shows the REAL error instead of a guess. */
const testChat = async (model, temperature = 0.3) => {
  const start = Date.now();
  return new Promise((resolve) => {
    let gotChunk = false;
    let replyText = '';
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };

    chatStream(
      [{ role: 'user', content: 'Reply with only the word "OK".' }],
      { model, temperature, generation: {} },
      {
        onChunk: (text) => { gotChunk = true; replyText += text; },
        onDone: (stats) => finish({
          ok: true,
          reply: replyText.trim().slice(0, 200),
          gotAnyText: gotChunk,
          latencyMs: Date.now() - start,
          tokens: stats?.totalTokens || 0,
        }),
        onError: (err) => finish({
          ok: false,
          error: err.message,
          latencyMs: Date.now() - start,
        }),
      }
    );
  });
};

module.exports = {
  checkHealth, listModels, chatStream, simpleChat, getProviderInfo, getActiveProvider,
  checkActiveModelAvailable, testChat, normaliseModelName,
};
