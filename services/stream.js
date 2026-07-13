/* ============================================
   UMRANIGPT - Streaming Service
   ============================================ */
'use strict';

window.AppStream = (() => {
  let activeController = null;

  /**
   * Stream from Ollama /api/chat or /api/generate
   * @param {string} url - Full endpoint URL
   * @param {object} body - Request body
   * @param {function} onChunk - Called with each text chunk
   * @param {function} onDone - Called on completion with stats
   * @param {function} onError - Called on error
   */
  const stream = async (url, body, onChunk, onDone, onError) => {
    // Abort any previous stream
    abort();
    activeController = new AbortController();
    const { signal } = activeController;

    const timeout = setTimeout(() => {
      abort();
      onError?.({ type: 'timeout', message: 'Request timed out' });
    }, window.AppConfig.CONNECTION_TIMEOUT * 6); // generous for streaming

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        let errMsg = `HTTP ${response.status}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errMsg;
        } catch { errMsg = errText || errMsg; }
        throw new Error(errMsg);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let stats = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        duration: 0,
        model: body.model || '',
      };

      let buffer = '';

      const processLine = (line) => {
        if (!line.trim()) return;
        const json = window.AppUtils.safeJsonParse(line);
        if (!json) return;

        // Explicit error object mid-stream
        if (json.error) {
          onError?.({ type: 'server', message: json.error });
          return;
        }

        // /api/chat format
        if (json.message?.content !== undefined) {
          if (!json.done) {
            onChunk?.(json.message.content);
          }
        }
        // /api/generate format
        else if (json.response !== undefined) {
          if (!json.done) {
            onChunk?.(json.response);
          }
        }

        // Final stats on done
        if (json.done) {
          stats = {
            promptTokens: json.prompt_eval_count || 0,
            completionTokens: json.eval_count || 0,
            totalTokens: (json.prompt_eval_count || 0) + (json.eval_count || 0),
            duration: json.total_duration ? Math.round(json.total_duration / 1e6) : 0,
            model: json.model || stats.model,
            evalDuration: json.eval_duration ? Math.round(json.eval_duration / 1e6) : 0,
          };
          onDone?.(stats);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          processLine(line);
        }

        if (signal.aborted) break;
      }

      // Process any remaining buffer
      if (buffer.trim()) processLine(buffer);

    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        onDone?.({ aborted: true });
      } else {
        onError?.({ type: 'network', message: err.message || 'Stream failed' });
      }
    } finally {
      activeController = null;
    }
  };

  /**
   * Non-streaming POST request
   */
  const request = async (url, body) => {
    abort();
    activeController = new AbortController();
    const { signal } = activeController;

    const timeout = setTimeout(() => abort(), window.AppConfig.CONNECTION_TIMEOUT * 3);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let msg = `HTTP ${response.status}`;
        try { msg = JSON.parse(text).error || msg; } catch { msg = text || msg; }
        throw new Error(msg);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Request cancelled');
      throw err;
    } finally {
      activeController = null;
    }
  };

  /**
   * GET request
   */
  const get = async (url, timeoutMs = window.AppConfig.CONNECTION_TIMEOUT) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      throw err;
    }
  };

  /**
   * Abort active stream
   */
  const abort = () => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
  };

  const isStreaming = () => activeController !== null;

  return { stream, request, get, abort, isStreaming };
})();
