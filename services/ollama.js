/* ============================================================
   UMRANIGPT — AI Service
   Talks ONLY to the UmraniGPT backend (server/) — never to
   Ollama directly. The backend enforces the active model and
   every generation parameter except temperature; nothing here
   knows (or needs to know) where Ollama actually lives.
============================================================ */
'use strict';

window.OllamaService = (() => {
  const getBase = () => (window.UMRANI_API_URL || '').trim().replace(/\/+$/, '');

  const endpoint = (path) => getBase() + path;

  /* ---- Connection status — feeds the Ready/Connected/Offline indicator ---- */
  const testConnection = async () => {
    const start = Date.now();
    try {
      const res = await fetch(endpoint('/api/chat/status'), { credentials: 'include' });
      if (!res.ok) return { ok: false, latency: Date.now() - start };
      const data = await res.json();
      return { ok: data.status === 'connected', latency: data.latency ?? (Date.now() - start) };
    } catch (err) {
      return { ok: false, error: err.message, latency: Date.now() - start };
    }
  };

  /* ---- Chat ----
     The server decides the model. The only generation parameter a
     user can influence is temperature, read from their own Settings. */
  const chat = async (messages, options = {}) => {
    const { onChunk, onDone, onError } = options;
    const settings = AppStorage.getSettings();

    const body = {
      messages: messages.map(m => ({
        role:    m.role,
        content: m.content,
        ...(m.images ? { images: m.images } : {}),
      })),
      temperature: settings.temperature ?? AppConfig.AI.TEMPERATURE,
      // Personal system prompt set by the user in Settings → AI Response
      ...(settings.userSystemPrompt ? { userSystemPrompt: settings.userSystemPrompt } : {}),
    };

    await AppStream.stream(endpoint('/api/chat'), body, onChunk, onDone, onError);
  };

  const abort = () => AppStream.abort();

  return { getBase, testConnection, chat, abort };
})();
