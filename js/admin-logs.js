/* ============================================================
   UMRANIGPT — Admin Logs
============================================================ */
'use strict';

window.AdminLogs = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));
  const escapeHtml = (s) => window.AdminApp.escapeHtml(s);
  const fmtDate = (ms) => window.AdminApp.fmtDate(ms);

  let state = { level: '', page: 1 };

  const load = async () => {
    const body = $('#admin-logs-body');
    body.innerHTML = `<tr class="admin-loading-row"><td colspan="3">Loading…</td></tr>`;

    try {
      const data = await window.AppApi.adminLogs({ level: state.level, page: state.page });

      if (!data.logs.length) {
        body.innerHTML = `<tr><td colspan="3"><div class="admin-empty-state"><i class="fa-regular fa-circle-check"></i>No logs — everything's running clean</div></td></tr>`;
      } else {
        body.innerHTML = data.logs.map((l) => `
          <tr>
            <td><span class="admin-badge admin-badge-${l.level === 'error' ? 'suspended' : 'user'}">${l.level}</span></td>
            <td style="max-width:480px;white-space:normal;word-break:break-word;">${escapeHtml(l.message)}</td>
            <td>${fmtDate(l.created_at)}</td>
          </tr>
        `).join('');
      }

      $('#admin-logs-count').textContent = `${data.total} log${data.total === 1 ? '' : 's'}`;
      $('#admin-logs-prev').disabled = data.page <= 1;
      $('#admin-logs-next').disabled = data.page >= data.totalPages;
      state.page = data.page;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="3"><div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(err.message || 'Could not load logs')}</div></td></tr>`;
    }
  };

  const init = () => {
    $('#admin-log-level-filter')?.addEventListener('change', (e) => { state.level = e.target.value; state.page = 1; load(); });
    $('#admin-logs-prev')?.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; load(); } });
    $('#admin-logs-next')?.addEventListener('click', () => { state.page += 1; load(); });
    $('#admin-logs-export-btn')?.addEventListener('click', (e) => { e.preventDefault(); window.open(window.AppApi.adminLogsExportUrl(), '_blank'); });
  };

  init();

  return { refresh: load };
})();
