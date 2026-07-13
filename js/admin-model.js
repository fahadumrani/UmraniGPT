/* ============================================================
   UMRANIGPT — Admin Model Control
============================================================ */
'use strict';

window.AdminModel = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));
  const escapeHtml = (s) => window.AdminApp.escapeHtml(s);

  const formatBytes = (bytes) => window.AppUtils?.formatBytes ? window.AppUtils.formatBytes(bytes) : `${bytes} B`;

  /* Same normalisation as the backend — "llama3" and "llama3:latest"
     are the same model to Ollama, so treat them as equal here too.
     Without this, the "Active" badge silently fails to show on the
     right card whenever a model was pulled without an explicit tag. */
  const normalise = (name) => {
    if (!name) return '';
    const t = String(name).trim();
    return t.endsWith(':latest') ? t.slice(0, -':latest'.length) : t;
  };

  const load = async () => {
    const statusEl = $('#admin-model-status');
    const listEl = $('#admin-model-list');
    listEl.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-spinner"></i>Loading models…</div>`;

    try {
      const data = await window.AppApi.adminGetModel();

      renderStatus(data);

      if (!data.availableModels.length) {
        listEl.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>No models found. Is Ollama running and reachable from the backend? Try <code>ollama pull ${escapeHtml(data.activeModel)}</code> on the machine running Ollama.</div>`;
        return;
      }

      listEl.innerHTML = data.availableModels.map((m) => {
        const isActive = normalise(m.name) === normalise(data.activeModel);
        return `
        <div class="admin-stat-card" style="cursor:pointer;${isActive ? 'outline:2px solid #8b5cf6;' : ''}" data-model="${escapeHtml(m.name)}">
          <div class="admin-stat-icon"><i class="fa-solid fa-microchip"></i></div>
          <div class="admin-stat-value" style="font-size:1.05rem;">${escapeHtml(m.name)}</div>
          <div class="admin-stat-label">${m.parameterSize || ''} ${m.quantization || ''} · ${formatBytes(m.size || 0)}</div>
          ${isActive
            ? '<span class="admin-badge admin-badge-active" style="align-self:flex-start;">Active</span>'
            : '<button class="admin-btn admin-btn-sm admin-btn-primary" data-select-model style="align-self:flex-start;">Make active</button>'}
        </div>
      `; }).join('');

      listEl.querySelectorAll('[data-select-model]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const card = e.target.closest('[data-model]');
          const model = card.dataset.model;
          btn.disabled = true;
          try {
            await window.AppApi.adminSetModel(model);
            window.AdminApp.showToast(`Active model set to ${model}`);
            load();
          } catch (err) {
            window.AdminApp.showToast(err.message || 'Could not change model', 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(err.message || 'Could not load models')}</div>`;
    }
  };

  /* Status banner — this is the part that directly answers
     "why doesn't it reply even though it shows connected?" */
  const renderStatus = (data) => {
    const statusEl = $('#admin-model-status');

    if (!data.ollamaReachable) {
      statusEl.innerHTML = `<span class="admin-badge admin-badge-suspended">AI server unreachable — check the URL in Provider Settings</span>`;
      return;
    }

    if (data.activeModelAvailable === false) {
      statusEl.innerHTML = `
        <div style="padding:12px 14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#fca5a5;font-size:0.85rem;line-height:1.5;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>
          <strong>This is almost certainly why chat isn't replying:</strong>
          the server is connected, but the active model
          "<strong>${escapeHtml(data.activeModel)}</strong>" isn't installed there.
          Either run <code>ollama pull ${escapeHtml(data.activeModel)}</code> on the
          machine running Ollama, or pick one of the models listed below.
        </div>`;
      return;
    }

    statusEl.innerHTML = `<span class="admin-badge admin-badge-active">Connected · active model is installed and ready</span>`;
  };

  /* ---- Test Model — sends one real message through the active
     model, using the exact same code path a real chat uses. This
     is the definitive answer to "is it actually working?" ---- */
  const testModel = async () => {
    const btn = $('#admin-model-test-btn');
    const resultEl = $('#admin-model-test-result');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testing…'; }
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<span style="color:var(--text-secondary);">Sending a real test message through the active model…</span>`;

    try {
      const result = await window.AppApi.adminTestModel();
      if (result.ok) {
        resultEl.innerHTML = `
          <div style="padding:12px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;color:#86efac;font-size:0.85rem;">
            <i class="fa-solid fa-circle-check" style="margin-right:6px;"></i>
            <strong>It works.</strong> Model "${escapeHtml(result.model)}" replied in ${result.latencyMs}ms.
            ${result.reply ? `Reply: <em>"${escapeHtml(result.reply)}"</em>` : '(no text — check the model itself)'}
          </div>`;
      } else {
        resultEl.innerHTML = `
          <div style="padding:12px 14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#fca5a5;font-size:0.85rem;">
            <i class="fa-solid fa-circle-xmark" style="margin-right:6px;"></i>
            <strong>Test failed.</strong> ${escapeHtml(result.error || 'Unknown error')}
            (after ${result.latencyMs}ms)
          </div>`;
      }
    } catch (err) {
      resultEl.innerHTML = `<span style="color:#fca5a5;">${escapeHtml(err.message || 'Test request failed')}</span>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-vial"></i> Test Model'; }
    }
  };

  const init = () => {
    $('#admin-model-refresh-btn')?.addEventListener('click', load);
    $('#admin-model-test-btn')?.addEventListener('click', testModel);
  };

  init();

  return { refresh: load };
})();
