/* ============================================================
   UMRANIGPT — Settings Manager
   UI preferences, plus Temperature (the only generation
   parameter users control — everything else is fixed by the
   administrator on the backend).
============================================================ */
'use strict';

window.AppSettings = (() => {
  const { $, emit } = window.AppUtils;
  let overlayEl, modalEl;

  const init = () => {
    overlayEl = document.getElementById('settings-overlay');
    modalEl   = document.getElementById('settings-modal');
    if (!overlayEl || !modalEl) return;
    bindNav();
    bindCloseHandlers();
    bindConnectionPanel();
    bindAiPanel();
    bindAppearancePanel();
    bindVoicePanel();
    bindDataPanel();
    AppUtils.on('action:openSettings', () => open());
  };

  /* ---- Open / Close ---- */
  const open = (panel = 'appearance') => {
    if (!overlayEl) return;
    loadAllValues();
    switchPanel(panel);
    overlayEl.classList.add('visible');
    AppShortcuts.disable();
  };
  const close = () => { overlayEl?.classList.remove('visible'); AppShortcuts.enable(); };

  const bindCloseHandlers = () => {
    overlayEl?.addEventListener('click', e => { if (e.target === overlayEl) close(); });
    modalEl?.querySelector('.modal-close')?.addEventListener('click', close);
  };

  /* ---- Navigation ---- */
  const bindNav = () => {
    modalEl?.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => switchPanel(item.dataset.panel));
    });
  };
  const switchPanel = (panel) => {
    modalEl?.querySelectorAll('.settings-nav-item').forEach(el => el.classList.toggle('active', el.dataset.panel === panel));
    modalEl?.querySelectorAll('.settings-panel').forEach(el => el.classList.toggle('active', el.id === `panel-${panel}`));
  };

  /* ---- Load values ---- */
  const loadAllValues = () => {
    const s = AppStorage.getSettings();
    AppTheme.renderThemePreviews($('#theme-grid'));
    setRange('#font-size-range',   '#font-size-val',   s.fontSize,   'px');
    setToggle('#animations-toggle',   s.animations);
    setToggle('#cursor-toggle',       s.customCursor !== false);
    setToggle('#timestamps-toggle',   s.showTimestamps);
    setToggle('#line-numbers-toggle', s.codeLineNumbers);
    setRange('#voice-speed-range',  '#voice-speed-val',  s.voiceSpeed);
    setRange('#voice-pitch-range',  '#voice-pitch-val',  s.voicePitch);
    setRange('#voice-volume-range', '#voice-volume-val', s.voiceVolume);
    setRange('#temperature-range',  '#temperature-val',  s.temperature);
    const promptEl = $('#user-system-prompt');
    if (promptEl) promptEl.value = s.userSystemPrompt || '';
    AppVoice.populateVoiceSelect($('#voice-select'));
    renderDataStats();
  };

  /* ---- AI panel — temperature + personal system prompt ---- */
  const bindAiPanel = () => {
    bindRange('#temperature-range', '#temperature-val', 'temperature', null, () => {});

    $('#save-system-prompt-btn')?.addEventListener('click', () => {
      const val = ($('#user-system-prompt')?.value || '').trim();
      AppStorage.updateSetting('userSystemPrompt', val);
      AppNotifications.success('Saved', val ? 'System prompt saved.' : 'System prompt cleared.');
    });
    $('#clear-system-prompt-btn')?.addEventListener('click', () => {
      const el = $('#user-system-prompt');
      if (el) el.value = '';
      AppStorage.updateSetting('userSystemPrompt', '');
      AppNotifications.info('Cleared', 'System prompt removed.');
    });
  };

  /* ---- Connection panel ---- */
  const bindConnectionPanel = () => {
    $('#test-connection-btn')?.addEventListener('click', testConnection);
    $('#ping-btn')?.addEventListener('click', pingServer);
    loadProviderStatus();
  };

  const loadProviderStatus = async () => {
    const dot   = $('#provider-dot');
    const label = $('#provider-label');
    if (!dot || !label) return;
    try {
      const data = await window.AppApi.getConfig();
      const r    = await OllamaService.testConnection();
      const ok   = r.ok;
      dot.style.background   = ok ? '#4ade80' : '#f87171';
      dot.style.boxShadow    = ok ? '0 0 0 3px rgba(74,222,128,0.2)' : 'none';
      label.textContent      = `${data.providerLabel || 'AI Provider'} · ${ok ? `Connected · ${r.latency}ms` : 'Offline'}`;
    } catch {
      dot.style.background = '#f87171';
      label.textContent    = 'Could not check connection status';
    }
  };

  const testConnection = async () => {
    const btn = $('#test-connection-btn');
    setLoading(btn, true);
    hideResult('conn-result');
    try {
      const r = await OllamaService.testConnection();
      if (r.ok) {
        showResult('conn-result', 'success', `✓ Connected · ${r.latency}ms`);
        AppUI.updateStatusUI('online', null, r.latency);
        loadProviderStatus();
      } else {
        showResult('conn-result', 'error', '✗ Not reachable right now');
        AppUI.updateStatusUI('offline');
      }
    } catch { showResult('conn-result', 'error', '✗ Not reachable right now'); }
    finally { setLoading(btn, false, '<i class="fa-solid fa-plug"></i> Test Connection'); }
  };

  const pingServer = async () => {
    const btn = $('#ping-btn');
    setLoading(btn, true);
    const t = Date.now();
    try { await OllamaService.testConnection(); AppNotifications.success('Ping', `${Date.now()-t}ms`); }
    catch { AppNotifications.error('Ping failed', 'Server not reachable.'); }
    finally { setLoading(btn, false, '<i class="fa-solid fa-satellite-dish"></i> Ping'); }
  };

  /* ---- Appearance panel ---- */
  const bindAppearancePanel = () => {
    bindRange('#font-size-range','#font-size-val','fontSize',null, v => document.documentElement.style.fontSize = `${v}px`);
    bindToggle('#animations-toggle',   'animations',    v => document.body.classList.toggle('no-animations', !v));
    bindToggle('#cursor-toggle',       'customCursor',  v => {
      if (window.AppCursor) v ? window.AppCursor.enable() : window.AppCursor.disable();
    });
    bindToggle('#timestamps-toggle',   'showTimestamps', v => document.querySelectorAll('.message-meta').forEach(el => el.style.display = v?'':'none'));
    bindToggle('#line-numbers-toggle', 'codeLineNumbers');
  };

  /* ---- Voice panel ---- */
  const bindVoicePanel = () => {
    bindRange('#voice-speed-range','#voice-speed-val','voiceSpeed');
    bindRange('#voice-pitch-range','#voice-pitch-val','voicePitch');
    bindRange('#voice-volume-range','#voice-volume-val','voiceVolume');
    $('#voice-select')?.addEventListener('change', e => AppStorage.updateSetting('voiceName', e.target.value));
    $('#test-voice-btn')?.addEventListener('click', () => AppVoice.speak('Hello! I am UmraniGPT, your AI assistant.'));
    $('#stop-voice-btn')?.addEventListener('click', () => AppVoice.stopSpeaking());
  };

  /* ---- Data panel ---- */
  const bindDataPanel = () => {
    $('#export-all-btn')?.addEventListener('click', () => { AppHistory.exportAll(); AppNotifications.success('Exported','All data exported.'); });
    $('#import-all-btn')?.addEventListener('click', () => {
      const inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
      inp.onchange = async e => {
        const f = e.target.files[0]; if(!f) return;
        const r = await AppHistory.importChats(f);
        if(r.ok) { AppNotifications.success('Imported',`${r.count} chat(s) imported.`); emit('dataImported',{}); }
        else AppNotifications.error('Import failed', r.error);
      };
      inp.click();
    });
    $('#backup-settings-btn')?.addEventListener('click', () => AppUtils.downloadFile(JSON.stringify(AppStorage.getSettings(),null,2),'umranigpt-settings.json','application/json'));
    $('#restore-settings-btn')?.addEventListener('click', () => {
      const inp=document.createElement('input'); inp.type='file'; inp.accept='.json';
      inp.onchange = async e => {
        const f=e.target.files[0]; if(!f) return;
        const t=await AppUtils.readFileAsText(f); const d=AppUtils.safeJsonParse(t);
        if(d&&typeof d==='object'){AppStorage.setSettings(d);loadAllValues();AppNotifications.success('Restored','Settings restored.');}
        else AppNotifications.error('Error','Invalid settings file.');
      };
      inp.click();
    });
    $('#clear-history-btn')?.addEventListener('click', () => {
      if(confirm('Delete ALL chat history? This cannot be undone.')) {
        AppStorage.setChats({}); AppStorage.setCurrentChatId(null);
        AppNotifications.success('Cleared','All chat history deleted.');
        emit('historyCleared',{}); close();
      }
    });
    $('#clear-settings-btn')?.addEventListener('click', () => {
      if(confirm('Reset all UI settings to defaults?')) { AppStorage.setSettings({}); loadAllValues(); AppNotifications.success('Reset','Settings reset.'); }
    });
  };

  /* ---- Stats ---- */
  const renderDataStats = () => {
    const all  = AppStorage.getAllChats();
    const msgs = all.reduce((n,c) => n+(c.messages?.length||0), 0);
    const el   = $('#data-stats');
    if (!el) return;
    const storageSize = (() => { let t=0; try{for(const k of Object.keys(localStorage)) t+=(localStorage.getItem(k)||'').length*2;}catch{} return AppUtils.formatBytes(t); })();
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);">
        ${stat('Chats',    all.length,  'fa-message')}
        ${stat('Messages', msgs,        'fa-comments')}
        ${stat('Storage',  storageSize, 'fa-database')}
      </div>`;
  };
  const stat = (label, value, icon) =>
    `<div style="background:var(--surface-1);border:1px solid var(--border-default);border-radius:var(--radius-md);padding:var(--space-3);text-align:center;">
      <i class="fa-solid ${icon}" style="color:var(--accent-primary);margin-bottom:4px;display:block;"></i>
      <div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">${value}</div>
      <div style="font-size:var(--text-xs);color:var(--text-muted);">${label}</div>
     </div>`;

  /* ---- Helpers ---- */
  const setVal    = (sel, val)            => { const e=$(sel); if(e) e.value=val??''; };
  const setRange  = (rs,vs,val,sfx='',cb)=> { const r=$(rs),v=$(vs); if(r) r.value=val; if(v) v.textContent=`${val}${sfx||''}`; cb?.(val); };
  const setToggle = (sel, val)            => { const e=$(sel); if(e) e.checked=!!val; };
  const bindRange = (rs,vs,key,sfx=null,cb) => {
    const r=$(rs),v=$(vs); if(!r) return;
    r.addEventListener('input',()=>{ const val=parseFloat(r.value); if(v) v.textContent=`${val}${sfx||''}`; AppStorage.updateSetting(key,val); cb?.(val); });
  };
  const bindToggle = (sel,key,cb) => {
    const e=$(sel); if(!e) return;
    e.addEventListener('change',()=>{ AppStorage.updateSetting(key,e.checked); cb?.(e.checked); });
  };
  const showResult = (id,type,msg) => {
    const el=document.getElementById(id); if(!el) return;
    el.className=`url-test-result ${type}`;
    el.innerHTML=`<i class="fa-solid fa-${type==='success'?'circle-check':'circle-xmark'}"></i> ${AppUtils.escapeHtml(msg)}`;
    el.style.display='flex';
  };
  const hideResult = (id) => { const el=document.getElementById(id); if(el) el.style.display='none'; };
  const setLoading = (btn,loading,html) => { if(!btn) return; btn.disabled=loading; btn.innerHTML=loading?'<span class="spinner spinner-sm"></span>':(html||btn.innerHTML); };

  return { init, open, close };
})();
