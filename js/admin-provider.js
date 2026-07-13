/* ============================================================
   UMRANIGPT — Admin Provider Settings
   Load/save app.json config via /api/config from the
   admin Provider view.
============================================================ */
'use strict';

window.AdminProvider = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));
  const escapeHtml = (s) => window.AdminApp.escapeHtml(s);

  let currentConfig = null;

  const showResult = (msg, ok) => {
    const el = $('#admin-provider-result');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<span class="admin-badge admin-badge-${ok ? 'active' : 'suspended'}">${escapeHtml(msg)}</span>`;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  };

  const syncProviderVisibility = (provider) => {
    $('#admin-provider-ollama').style.display  = provider === 'ollama'        ? 'block' : 'none';
    $('#admin-provider-openai').style.display  = provider === 'openai_compat' ? 'block' : 'none';
  };

  const load = async () => {
    try {
      currentConfig = await window.AppApi.getConfigFull();

      const providerSel = $('#admin-provider-select');
      if (providerSel) {
        providerSel.value = currentConfig.provider || 'ollama';
        syncProviderVisibility(providerSel.value);
      }

      const ollamaUrl = currentConfig.providers?.ollama?.url || '';
      if ($('#admin-ollama-url')) $('#admin-ollama-url').value = ollamaUrl;

      const oaUrl = currentConfig.providers?.openai_compat?.url || '';
      if ($('#admin-openai-url')) $('#admin-openai-url').value = oaUrl;
      // Never pre-fill the API key field — show placeholder only

      const gen = currentConfig.generation || {};
      if ($('#admin-gen-temperature')) $('#admin-gen-temperature').value = gen.temperature ?? 0.7;
      if ($('#admin-gen-context'))     $('#admin-gen-context').value     = gen.contextLength ?? 4096;
      if ($('#admin-gen-maxtokens'))   $('#admin-gen-maxtokens').value   = gen.maxTokens ?? 8192;

      if ($('#admin-system-prompt')) $('#admin-system-prompt').value = currentConfig.system?.systemPrompt || '';
    } catch (err) {
      window.AdminApp.showToast(err.message || 'Could not load provider config', 'error');
    }
  };

  const save = async () => {
    const saveBtn = $('#admin-provider-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const provider = $('#admin-provider-select')?.value || 'ollama';

      const partial = {
        provider,
        providers: {
          ollama: {
            enabled: provider === 'ollama',
            url: ($('#admin-ollama-url')?.value || '').trim() || 'http://localhost:11434',
          },
          openai_compat: {
            enabled: provider === 'openai_compat',
            url: ($('#admin-openai-url')?.value || '').trim() || 'http://localhost:1234/v1',
          },
        },
        generation: {
          temperature: parseFloat($('#admin-gen-temperature')?.value) || 0.7,
          contextLength: parseInt($('#admin-gen-context')?.value)     || 4096,
          maxTokens:     parseInt($('#admin-gen-maxtokens')?.value)   || 8192,
        },
        system: {
          systemPrompt: ($('#admin-system-prompt')?.value || '').trim(),
        },
      };

      // Only include API key if the admin actually typed something (avoid overwriting with empty)
      const keyVal = ($('#admin-openai-key')?.value || '').trim();
      if (keyVal) partial.providers.openai_compat.apiKey = keyVal;

      await window.AppApi.updateConfig(partial);
      showResult('✓ Provider settings saved', true);
      window.AdminApp.showToast('Provider config saved — takes effect immediately');
      if ($('#admin-openai-key')) $('#admin-openai-key').value = '';
    } catch (err) {
      showResult(`✗ ${err.message || 'Save failed'}`, false);
      window.AdminApp.showToast(err.message || 'Could not save config', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  const init = () => {
    $('#admin-provider-save-btn')?.addEventListener('click', save);
    $('#admin-provider-select')?.addEventListener('change', (e) => syncProviderVisibility(e.target.value));
  };

  init();

  return { refresh: load };
})();
