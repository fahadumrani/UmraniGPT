/* ============================================================
   UMRANIGPT — Admin System Stats
============================================================ */
'use strict';

window.AdminSystem = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));
  const escapeHtml = (s) => window.AdminApp.escapeHtml(s);
  const formatBytes = (b) => window.AppUtils?.formatBytes ? window.AppUtils.formatBytes(b) : `${b} B`;

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const load = async () => {
    const grid = $('#admin-system-grid');
    const detailsBody = $('#admin-system-details tbody');

    try {
      const data = await window.AppApi.adminSystem();

      const cards = [
        { icon: 'fa-microchip', label: 'CPU usage', value: data.cpu.usagePercent !== null ? `${data.cpu.usagePercent}%` : 'n/a', sub: `${data.cpu.cores} cores` },
        { icon: 'fa-memory', label: 'RAM usage', value: data.memory.usedPercent !== null ? `${data.memory.usedPercent}%` : 'n/a', sub: `${formatBytes(data.memory.usedBytes)} / ${formatBytes(data.memory.totalBytes)}` },
        { icon: 'fa-hard-drive', label: 'Disk usage', value: data.disk?.usedPercent != null ? `${data.disk.usedPercent}%` : 'n/a', sub: data.disk ? `${formatBytes(data.disk.usedBytes)} / ${formatBytes(data.disk.totalBytes)}` : 'Unavailable on this platform' },
        { icon: 'fa-clock', label: 'Server uptime', value: formatUptime(data.serverUptimeSeconds), sub: data.platform },
      ];

      grid.innerHTML = cards.map((c) => `
        <div class="admin-stat-card">
          <div class="admin-stat-icon"><i class="fa-solid ${c.icon}"></i></div>
          <div class="admin-stat-value">${c.value}</div>
          <div class="admin-stat-label">${c.label}${c.sub ? ` · ${escapeHtml(c.sub)}` : ''}</div>
        </div>
      `).join('');

      const rows = [
        ['Ollama connection', data.ollama.connected
          ? `<span class="admin-badge admin-badge-active">Connected${data.ollama.latencyMs != null ? ` · ${data.ollama.latencyMs}ms` : ''}</span>`
          : '<span class="admin-badge admin-badge-suspended">Offline</span>'],
        ['Models available', data.ollama.modelCount ?? '—'],
        ['Ollama URL (admin only)', `<code>${escapeHtml(data.ollamaUrl)}</code>`],
      ];
      detailsBody.innerHTML = rows.map(([k, v]) => `<tr><td style="color:var(--text-secondary);">${k}</td><td>${v}</td></tr>`).join('');
    } catch (err) {
      grid.innerHTML = `<div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(err.message || 'Could not load system stats')}</div>`;
    }
  };

  return { refresh: load };
})();
