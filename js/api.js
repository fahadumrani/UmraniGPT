/* ============================================================
   UMRANIGPT — API Client
   Talks to the UmraniGPT authentication / admin backend.
   Session is a secure httpOnly cookie — never touched directly
   by this file, just carried automatically by the browser.
============================================================ */
'use strict';

window.AppApi = (() => {

  const getBaseUrl = () => {
    // Same-origin by default. If the backend is served from elsewhere
    // (its own Cloudflare Tunnel, a different port, etc.) set
    // window.UMRANI_API_URL before this script loads — see config.js.
    const configured = (window.UMRANI_API_URL || '').trim();
    return configured.replace(/\/+$/, '');
  };

  const request = async (path, { method = 'GET', body } = {}) => {
    let res;
    try {
      res = await fetch(getBaseUrl() + path, {
        method,
        credentials: 'include',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      const err = new Error('Cannot reach the server. Check your connection and try again.');
      err.status = 0;
      err.cause = networkErr;
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      try { data = await res.json(); } catch { /* empty/invalid body */ }
    }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  return {
    // ---- Auth ----
    signup: (email, password) =>
      request('/api/auth/signup', { method: 'POST', body: { email, password } }),

    login: (email, password, rememberMe) =>
      request('/api/auth/login', { method: 'POST', body: { email, password, rememberMe: !!rememberMe } }),

    logout: () => request('/api/auth/logout', { method: 'POST' }),

    me: () => request('/api/auth/me'),

    oauthProviders: () => request('/api/auth/providers'),
    oauthUrl: (provider) => getBaseUrl() + `/api/auth/${provider}`,

    // Config
    getConfig:       () => request('/api/config'),
    getConfigFull:   () => request('/api/config/full'),
    updateConfig:    (partial) => request('/api/config', { method: 'PUT', body: partial }),
    reloadConfig:    () => request('/api/config/reload', { method: 'POST' }),
    getProviderHealth: () => request('/api/config/health'),

    // ---- Admin ----
    adminDashboard: () => request('/api/admin/dashboard'),

    adminUsers: (params = {}) => {
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
      const qs = new URLSearchParams(clean).toString();
      return request('/api/admin/users' + (qs ? `?${qs}` : ''));
    },

    adminSuspendUser: (id) => request(`/api/admin/users/${id}/suspend`, { method: 'POST' }),
    adminEnableUser:  (id) => request(`/api/admin/users/${id}/enable`, { method: 'POST' }),
    adminDeleteUser:  (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
    adminUsersExportUrl: () => getBaseUrl() + '/api/admin/users/export',
    adminResetConversations: (id) => request(`/api/admin/users/${id}/reset-conversations`, { method: 'POST' }),
    adminResetTokens:        (id) => request(`/api/admin/users/${id}/reset-tokens`, { method: 'POST' }),
    adminGetMemory:  (id) => request(`/api/admin/users/${id}/memory`),
    adminResetMemory: (id) => request(`/api/admin/users/${id}/reset-memory`, { method: 'POST' }),

    adminGetModel: () => request('/api/admin/model'),
    adminSetModel: (model) => request('/api/admin/model', { method: 'PUT', body: { model } }),
    adminTestModel: () => request('/api/admin/model/test', { method: 'POST' }),

    adminSystem: () => request('/api/admin/system'),
    adminActivity: (hours = 24) => request(`/api/admin/activity?hours=${encodeURIComponent(hours)}`),
    adminActivityUsage: (hours = 24) => request(`/api/admin/activity/usage?hours=${encodeURIComponent(hours)}`),

    adminLogs: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('/api/admin/logs' + (qs ? `?${qs}` : ''));
    },
    adminLogsExportUrl: () => getBaseUrl() + '/api/admin/logs/export',
  };
})();
