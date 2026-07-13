/* ============================================================
   UMRANIGPT — Admin App Bootstrap
   Dashboard view, navigation, theme toggle, auth guard.
   User management lives in js/admin-users.js.
============================================================ */
'use strict';

window.AdminApp = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));

  const fmtDate = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const escapeHtml = (str) => window.AppUtils?.escapeHtml
    ? window.AppUtils.escapeHtml(str)
    : String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- Toast ---- */
  let toastTimer = null;
  const showToast = (message, type = 'success') => {
    const el = $('#admin-toast');
    if (!el) return;
    el.textContent = message;
    el.className = `admin-toast is-visible is-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
  };

  /* ---- Navigation ---- */
  const switchView = (view) => {
    document.querySelectorAll('.admin-nav-btn[data-view]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
    document.querySelectorAll('.admin-view').forEach((section) => {
      section.classList.toggle('is-active', section.id === `view-${view}`);
    });

    const titles = {
      dashboard: ['Dashboard', 'Live overview of your UmraniGPT deployment'],
      users:     ['Users',    'Search, filter and manage registered accounts'],
      model:     ['Model Control', 'Choose the model every user is served'],
      provider:  ['Provider Settings', 'Switch AI backends and configure generation defaults'],
      system:    ['System',   'Server resources and AI connection health'],
      logs:      ['Logs',     'Recent error and warning activity'],
    };
    const [title, subtitle] = titles[view] || titles.dashboard;
    $('#admin-view-title').textContent   = title;
    $('#admin-view-subtitle').textContent = subtitle;

    closeMobileSidebar();

    if (view === 'dashboard' && window.AdminActivity) window.AdminActivity.refresh();
    if (view === 'users'    && window.AdminUsers)    window.AdminUsers.refresh();
    if (view === 'model'    && window.AdminModel)    window.AdminModel.refresh();
    if (view === 'provider' && window.AdminProvider) window.AdminProvider.refresh();
    if (view === 'system'   && window.AdminSystem)   window.AdminSystem.refresh();
    if (view === 'logs'     && window.AdminLogs)     window.AdminLogs.refresh();
  };

  const bindNav = () => {
    document.querySelectorAll('.admin-nav-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  };

  /* ---- Mobile sidebar ---- */
  const openMobileSidebar = () => {
    $('#admin-sidebar')?.classList.add('is-open');
    $('#admin-sidebar-overlay')?.classList.add('is-visible');
  };
  const closeMobileSidebar = () => {
    $('#admin-sidebar')?.classList.remove('is-open');
    $('#admin-sidebar-overlay')?.classList.remove('is-visible');
  };
  const bindMobileSidebar = () => {
    $('#admin-mobile-menu-btn')?.addEventListener('click', openMobileSidebar);
    $('#admin-sidebar-overlay')?.addEventListener('click', closeMobileSidebar);
  };

  /* ---- Theme (Dashboard only offers Dark / Light, per spec) ---- */
  const applyThemeButtons = () => {
    const current = window.AppTheme?.getResolved ? window.AppTheme.getResolved() : 'dark';
    document.querySelectorAll('.admin-theme-toggle button').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === current);
    });
  };
  const bindThemeToggle = () => {
    document.querySelectorAll('.admin-theme-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.AppTheme.apply(btn.dataset.themeChoice);
        applyThemeButtons();
      });
    });
    applyThemeButtons();
  };

  /* ---- Account info ---- */
  const renderAccount = (user) => {
    $('#admin-email').textContent = user.email;
    $('#admin-avatar').textContent = user.email.charAt(0).toUpperCase();
  };

  /* ---- Dashboard stats ---- */
  const STAT_DEFS = [
    { key: 'totalUsers',     label: 'Registered users', icon: 'fa-users' },
    { key: 'onlineUsers',    label: 'Online now',       icon: 'fa-circle-check' },
    { key: 'suspendedUsers', label: 'Suspended',        icon: 'fa-user-slash' },
    { key: 'totalMessages',  label: 'Total messages',   icon: 'fa-comments' },
    { key: 'totalTokens',    label: 'Total tokens',     icon: 'fa-coins' },
    { key: 'avgResponseTimeMs', label: 'Avg response time', icon: 'fa-stopwatch', suffix: 'ms' },
    { key: 'requestsPerMinute', label: 'Requests / min', icon: 'fa-gauge' },
    { key: 'ollamaConnected', label: 'AI server', icon: 'fa-server', isStatus: true },
  ];

  const renderStatCards = (stats) => {
    const grid = $('#admin-stats-grid');
    if (!grid) return;
    grid.innerHTML = STAT_DEFS.map((def) => {
      const raw = stats[def.key];
      const value = def.isStatus
        ? `<span class="admin-badge admin-badge-${raw ? 'active' : 'suspended'}">${raw ? 'Connected' : 'Offline'}</span>`
        : `${Number(raw ?? 0).toLocaleString()}${def.suffix || ''}`;
      return `
      <div class="admin-stat-card">
        <div class="admin-stat-icon"><i class="fa-solid ${def.icon}"></i></div>
        <div class="admin-stat-value">${value}</div>
        <div class="admin-stat-label">${def.label}</div>
      </div>`;
    }).join('');
  };

  const renderRecentUsers = (users) => {
    const body = $('#admin-recent-users-body');
    if (!body) return;
    if (!users.length) {
      body.innerHTML = `<tr><td colspan="5"><div class="admin-empty-state"><i class="fa-regular fa-user"></i>No users yet</div></td></tr>`;
      return;
    }
    body.innerHTML = users.map((u) => `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="admin-badge admin-badge-${u.role}">${u.role}</span></td>
        <td><span class="admin-badge admin-badge-${u.status}">${u.status}</span></td>
        <td>${fmtDate(u.created_at)}</td>
        <td>${fmtDate(u.last_login_at)}</td>
      </tr>
    `).join('');
  };

  const loadDashboard = async () => {
    try {
      const stats = await window.AppApi.adminDashboard();
      renderStatCards(stats);
      renderRecentUsers(stats.recentUsers || []);
      renderModelWarning(stats.modelWarning);
    } catch (err) {
      showToast(err.message || 'Could not load dashboard stats', 'error');
    }
  };

  /* Shows a persistent, unmissable banner at the top of the
     Dashboard when the active model isn't actually installed —
     the #1 cause of "connected but doesn't reply". */
  const renderModelWarning = (message) => {
    let el = document.getElementById('admin-dashboard-warning');
    if (!message) { if (el) el.style.display = 'none'; return; }

    if (!el) {
      el = document.createElement('div');
      el.id = 'admin-dashboard-warning';
      el.style.cssText = 'margin-bottom:16px;padding:14px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#fca5a5;font-size:0.85rem;line-height:1.5;display:flex;align-items:center;gap:10px;';
      document.getElementById('admin-stats-grid')?.before(el);
    }
    el.style.display = 'flex';
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size:1.1rem;flex-shrink:0;"></i>
      <span>${escapeHtml(message)} <a href="#" data-view="model" style="color:inherit;font-weight:600;text-decoration:underline;">Go to Model Control →</a></span>`;
    el.querySelector('[data-view="model"]')?.addEventListener('click', (e) => { e.preventDefault(); switchView('model'); });
  };

  /* ---- Logout ---- */
  const bindLogout = () => {
    $('#admin-logout-btn')?.addEventListener('click', () => window.AppAuth.logout());
  };

  /* ---- Boot ---- */
  const init = async () => {
    const user = await window.AppAuth.guardAdmin();
    if (!user) return; // AppAuth already redirected

    if (window.AppTheme) window.AppTheme.init();
    renderAccount(user);
    bindNav();
    bindMobileSidebar();
    bindThemeToggle();
    bindLogout();

    document.getElementById('admin-body').style.display = '';
    await loadDashboard();

    // Keep dashboard numbers fresh while the tab is open.
    setInterval(() => {
      if (document.getElementById('view-dashboard').classList.contains('is-active')) {
        loadDashboard();
      }
    }, 15000);
  };

  return { init, showToast, switchView, fmtDate, escapeHtml };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', AdminApp.init);
} else {
  AdminApp.init();
}
