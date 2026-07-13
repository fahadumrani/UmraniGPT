/* ============================================================
   UMRANIGPT SERVER — Ollama Client
   The ONLY place in the whole app that knows the real Ollama
   URL. Everything else (including the admin dashboard's model
   list) goes through here.

   The URL is resolved LIVE on every call from app.json
   (admin-editable via admin.html → Provider Settings), falling
   back to server/config/ollama.env only if app.json has never
   been set. This is what makes "change Ollama URL from the
   admin panel" actually take effect without a server restart —
   previously this file cached the URL once at startup, so admin
   panel changes were silently ignored for real requests.
============================================================ */
'use strict';

const appConfig = require('./config');

const DEFAULT_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');

/* Live URL resolver — call this, never read a cached constant. */
const getOllamaUrl = () => {
  try {
    const configured = appConfig.get()?.providers?.ollama?.url;
    if (configured && typeof configured === 'string' && configured.trim()) {
      return configured.trim().replace(/\/+$/, '');
    }
  } catch { /* config not ready yet — fall through to default */ }
  return DEFAULT_URL;
};

const fetchWithTimeout = async (url, opts = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/* ---- Health check (used by /api/chat/status and admin dashboard) ---- */
const checkHealth = async () => {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${getOllamaUrl()}/api/tags`, {}, 5000);
    if (!res.ok) return { ok: false, latency: Date.now() - start };
    const data = await res.json();
    return { ok: true, latency: Date.now() - start, modelCount: (data.models || []).length };
  } catch {
    return { ok: false, latency: Date.now() - start };
  }
};

/* ---- List models (admin only — used to populate the Model Control dropdown) ---- */
const listModels = async () => {
  const res = await fetchWithTimeout(`${getOllamaUrl()}/api/tags`, {}, 8000);
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => ({
    name: m.name,
    size: m.size,
    parameterSize: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
    modifiedAt: m.modified_at,
  }));
};

/* ---- Chat, streamed ----
   options: { model, temperature, systemPrompt, generation: {top_p, top_k, repeat_penalty, num_ctx, seed} }
   Calls onChunk(text) per token, onDone(stats), onError(err). Never
   trusts the caller for anything except messages + temperature. */
const chatStream = async (messages, options, { onChunk, onDone, onError, signal }) => {
  const gen = options.generation || {};
  const ollamaUrl = getOllamaUrl();

  const body = {
    model: options.model,
    messages: options.systemPrompt && !messages.some((m) => m.role === 'system')
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages,
    stream: true,
    options: {
      temperature: options.temperature,
      top_p: gen.top_p,
      top_k: gen.top_k,
      repeat_penalty: gen.repeat_penalty,
      num_ctx: gen.num_ctx,
      ...(typeof gen.seed === 'number' && gen.seed >= 0 ? { seed: gen.seed } : {}),
    },
  };

  let res;
  const CONNECT_TIMEOUT_MS = Number(process.env.CHAT_CONNECT_TIMEOUT_MS || 120000);
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => timeoutController.abort(), CONNECT_TIMEOUT_MS);

  // Combine the caller's abort signal (user clicked Stop) with our
  // connection timeout, so either one can cancel the request.
  const combinedSignal = (signal && typeof AbortSignal.any === 'function')
    ? AbortSignal.any([signal, timeoutController.signal])
    : (signal || timeoutController.signal);

  try {
    res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (err) {
    clearTimeout(timeoutTimer);
    if (err.name === 'AbortError' && timeoutController.signal.aborted && !signal?.aborted) {
      onError(new Error(`The AI server took too long to respond (>${Math.round(CONNECT_TIMEOUT_MS / 1000)}s). It may be overloaded or the model may still be loading.`));
    } else if (err.name === 'AbortError') {
      onDone({ aborted: true, model: options.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 });
    } else {
      onError(new Error('Could not reach the AI server.'));
    }
    return;
  }
  clearTimeout(timeoutTimer); // connected — stop worrying about connect timeout, streaming can take as long as it needs

  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    onError(new Error(detail || `AI server returned ${res.status}`));
    return;
  }

  let buffer = '';
  let sawAnyChunk = false;
  const decoder = new TextDecoder('utf-8');

  try {
    for await (const chunk of res.body) {
      // Node's native fetch() yields Web Streams API Uint8Array chunks,
      // not Node Buffers — TextDecoder handles multi-byte UTF-8
      // characters that happen to straddle a chunk boundary correctly.
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;

        let data;
        try { data = JSON.parse(line); } catch { continue; }

        if (data.error) {
          onError(new Error(data.error));
          return;
        }

        if (data.message?.content) {
          sawAnyChunk = true;
          onChunk(data.message.content);
        }

        if (data.done) {
          onDone({
            model: data.model || options.model,
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
            durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : 0,
          });
          return;
        }
      }
    }
    // Stream ended without an explicit done:true — still resolve.
    if (sawAnyChunk) onDone({ model: options.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 });
    else onError(new Error('The AI server closed the connection unexpectedly.'));
  } catch (err) {
    if (err.name === 'AbortError') { onDone({ aborted: true, model: options.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 }); return; }
    onError(err);
  }
};

/* ---- Simple, non-streamed chat ----
   For internal/background tasks (like memory extraction) that need
   one complete response rather than a stream to relay to a client. */
const simpleChat = async (messages, { model, temperature = 0.3, timeoutMs = 20000 } = {}) => {
  const res = await fetchWithTimeout(`${getOllamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature } }),
  }, timeoutMs);

  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return data.message?.content || '';
};

module.exports = {
  checkHealth, listModels, chatStream, simpleChat,
  getOllamaUrl,
  get OLLAMA_URL() { return getOllamaUrl(); }, // live getter — backward compatible with existing callers
};
