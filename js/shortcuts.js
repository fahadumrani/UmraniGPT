/* ============================================
   UMRANIGPT - Keyboard Shortcuts
   ============================================ */
'use strict';

window.AppShortcuts = (() => {
  const shortcuts = [
    { keys: ['ctrl', 'enter'],      action: 'send',        desc: 'Send message' },
    { keys: ['ctrl', 'n'],          action: 'newChat',     desc: 'New chat' },
    { keys: ['ctrl', 'k'],          action: 'search',      desc: 'Search chats' },
    { keys: ['ctrl', 'b'],          action: 'toggleSidebar', desc: 'Toggle sidebar' },
    { keys: ['ctrl', ','],          action: 'settings',    desc: 'Open settings' },
    { keys: ['ctrl', 'shift', 't'], action: 'cycleTheme',  desc: 'Cycle theme' },
    { keys: ['ctrl', 'shift', 'c'], action: 'copyLast',    desc: 'Copy last response' },
    { keys: ['ctrl', '/'],          action: 'shortcuts',   desc: 'Show shortcuts' },
    { keys: ['escape'],             action: 'escape',      desc: 'Close / cancel' },
    { keys: ['ctrl', 'shift', 'e'], action: 'exportChat',  desc: 'Export current chat' },
    { keys: ['alt', 'arrowup'],     action: 'prevChat',    desc: 'Previous chat' },
    { keys: ['alt', 'arrowdown'],   action: 'nextChat',    desc: 'Next chat' },
  ];

  let enabled = true;

  const init = () => {
    document.addEventListener('keydown', handleKeyDown);
  };

  const handleKeyDown = (e) => {
    if (!enabled) return;

    // Don't fire when typing in input/textarea (except Ctrl+Enter, Escape)
    const inInput = e.target.matches('input, textarea, select, [contenteditable]');
    const isCtrlEnter = e.ctrlKey && e.key === 'Enter';
    const isEscape = e.key === 'Escape';
    if (inInput && !isCtrlEnter && !isEscape) return;

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    for (const shortcut of shortcuts) {
      const keys = shortcut.keys;
      const needsCtrl = keys.includes('ctrl');
      const needsShift = keys.includes('shift');
      const needsAlt = keys.includes('alt');
      const mainKey = keys.find(k => !['ctrl','shift','alt','meta'].includes(k));

      if (
        needsCtrl === ctrl &&
        needsShift === shift &&
        needsAlt === alt &&
        mainKey === key
      ) {
        e.preventDefault();
        execute(shortcut.action, e);
        return;
      }
    }
  };

  const execute = (action, e) => {
    switch (action) {
      case 'send':
        document.getElementById('send-btn')?.click();
        break;
      case 'newChat':
        AppUtils.emit('action:newChat', {});
        break;
      case 'search':
        document.getElementById('sidebar-search-input')?.focus();
        if (AppStorage.getSidebarOpen() === false) {
          AppUtils.emit('action:toggleSidebar', {});
        }
        break;
      case 'toggleSidebar':
        AppUtils.emit('action:toggleSidebar', {});
        break;
      case 'settings':
        AppUtils.emit('action:openSettings', {});
        break;
      case 'cycleTheme':
        AppTheme.cycle();
        AppNotifications.info(`Theme: ${AppTheme.getThemeName(AppTheme.get())}`);
        break;
      case 'copyLast':
        copyLastResponse();
        break;
      case 'escape':
        handleEscape();
        break;
      case 'exportChat':
        AppUtils.emit('action:exportChat', {});
        break;
      case 'prevChat':
        AppUtils.emit('action:prevChat', {});
        break;
      case 'nextChat':
        AppUtils.emit('action:nextChat', {});
        break;
      case 'shortcuts':
        showShortcutsModal();
        break;
    }
  };

  const copyLastResponse = async () => {
    const msgs = document.querySelectorAll('.message-wrapper.assistant .message-content');
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    const text = last.textContent || '';
    const ok = await AppUtils.copyToClipboard(text);
    if (ok) AppNotifications.success('Copied', 'Last response copied to clipboard');
  };

  const handleEscape = () => {
    // Close open modals
    document.querySelectorAll('.modal-overlay.visible').forEach(el => {
      el.classList.remove('visible');
    });
    // Close dropdowns
    document.querySelectorAll('.model-dropdown.open').forEach(el => {
      el.classList.remove('open');
    });
    document.querySelectorAll('#context-menu.visible').forEach(el => {
      el.classList.remove('visible');
    });
    // Stop streaming
    if (AppStream.isStreaming()) {
      AppStream.abort();
      AppUtils.emit('action:stopStream', {});
    }
    // Stop voice
    if (AppVoice.isRecognising()) AppVoice.stopListening();
    if (AppVoice.isTalking()) AppVoice.stopSpeaking();
    // Close mobile sidebar overlay
    AppUtils.emit('action:closeMobileSidebar', {});
  };

  const showShortcutsModal = () => {
    let modal = document.getElementById('shortcuts-modal-overlay');
    if (modal) { modal.classList.toggle('visible'); return; }

    modal = document.createElement('div');
    modal.id = 'shortcuts-modal-overlay';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-keyboard"></i> Keyboard Shortcuts</div>
          <button class="modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:var(--space-5);">
          <div style="display:flex;flex-direction:column;gap:var(--space-2);">
            ${shortcuts.map(s => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
                <span style="font-size:var(--text-sm);color:var(--text-secondary);">${s.desc}</span>
                <div style="display:flex;gap:4px;">
                  ${s.keys.map(k => `<kbd style="padding:2px 7px;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--radius-xs);font-size:11px;font-family:var(--font-mono);color:var(--text-primary);">${k === 'ctrl' ? '⌘/Ctrl' : k.toUpperCase()}</kbd>`).join('+')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('visible'); });
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));
  };

  const disable = () => { enabled = false; };
  const enable = () => { enabled = true; };

  return { init, execute, disable, enable, showShortcutsModal, list: shortcuts };
})();
