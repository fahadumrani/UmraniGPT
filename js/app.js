/* ============================================================
   UMRANIGPT — Application Bootstrap
============================================================ */
'use strict';

window.App = (() => {
  let initialised = false;

  const init = async () => {
    if (initialised) return;
    initialised = true;

    try {
      const user = await AppAuth.guardUser();
      if (!user) return; // AppAuth already redirected to login.html

      animateLoadingDots();

      /* Initialise modules in dependency order */
      AppSecurity.init();
      AppTheme.init();
      AppNotifications.init();
      AppHistory.init();
      AppMarkdown.init();
      AppVoice.init();
      AppShortcuts.init();
      AppSettings.init();
      AppSidebar.init();

      AppDragDrop.init((files) => AppUtils.emit('fileAdded', files));

      AppUI.init();
      AppChat.init();

      registerServiceWorker();
      AppUI.hideLoadingScreen();

      console.log(
        '%c✨ UmraniGPT v' + AppConfig.VERSION + ' ready',
        'background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;padding:6px 12px;border-radius:6px;font-weight:700;'
      );
    } catch (err) {
      console.error('Init error:', err);
      AppNotifications.error('Startup Error', err.message || 'Failed to initialise.');
    }
  };

  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            AppNotifications.info('Update available', 'Reload to apply the latest version.');
          }
        });
      });
    } catch { /* SW optional */ }
  };

  const animateLoadingDots = () => {
    document.querySelectorAll('.loading-dot').forEach((dot, i) => {
      setTimeout(() => dot.style.opacity = '1', i * 150);
    });
  };

  window.addEventListener('unhandledrejection', e => console.warn('Unhandled rejection:', e.reason));
  window.addEventListener('error', e => console.error('Global error:', e.message));

  return { init };
})();

/* Boot */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.init);
else App.init();
