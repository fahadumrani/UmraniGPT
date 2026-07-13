/* ============================================================
   UMRANIGPT — Admin User Management
============================================================ */
'use strict';

window.AdminUsers = (() => {
  const $ = window.AppUtils?.$ || ((sel, ctx = document) => ctx.querySelector(sel));

  let state = {
    search: '',
    status: '',
    role: '',
    page: 1,
  };
  let loaded = false;
  let searchDebounce = null;

  const escapeHtml = (str) => window.AdminApp.escapeHtml(str);
  const fmtDate = (ms) => window.AdminApp.fmtDate(ms);

  const renderRows = (users) => {
    const body = $('#admin-users-body');
    if (!users.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="admin-empty-state"><i class="fa-solid fa-magnifying-glass"></i>No matching users</div></td></tr>`;
      return;
    }

    body.innerHTML = users.map((u) => `
      <tr data-user-id="${u.id}">
        <td>
          <div class="admin-email-cell">
            <span class="admin-dot ${u.online ? 'is-online' : ''}" title="${u.online ? 'Online' : 'Offline'}"></span>
            ${escapeHtml(u.email)}
          </div>
        </td>
        <td><span class="admin-badge admin-badge-${u.role}">${u.role}</span></td>
        <td><span class="admin-badge admin-badge-${u.status}">${u.status}</span></td>
        <td>${Number(u.totalTokens || 0).toLocaleString()} tok · ${Number(u.totalMessages || 0).toLocaleString()} msgs</td>
        <td>${fmtDate(u.created_at)}</td>
        <td>${fmtDate(u.last_login_at)}</td>
        <td>
          <div class="admin-row-actions">
            ${u.role === 'admin' ? '' : u.status === 'active'
              ? `<button class="admin-btn admin-btn-sm" data-action="suspend" data-id="${u.id}">Suspend</button>`
              : `<button class="admin-btn admin-btn-sm" data-action="enable" data-id="${u.id}">Enable</button>`
            }
            <button class="admin-btn admin-btn-sm" data-action="reset-conversations" data-id="${u.id}" title="Clear this user's local chat history">Reset Chats</button>
            <button class="admin-btn admin-btn-sm" data-action="reset-tokens" data-id="${u.id}" title="Reset usage counters">Reset Tokens</button>
            <button class="admin-btn admin-btn-sm" data-action="view-memory" data-id="${u.id}" data-email="${escapeHtml(u.email)}" title="View / reset long-term memory">Memory</button>
            ${u.role === 'admin' ? '' : `<button class="admin-btn admin-btn-sm admin-btn-danger" data-action="delete" data-id="${u.id}" data-email="${escapeHtml(u.email)}">Delete</button>`}
          </div>
        </td>
      </tr>
    `).join('');
  };

  const load = async () => {
    const body = $('#admin-users-body');
    body.innerHTML = `<tr class="admin-loading-row"><td colspan="7">Loading…</td></tr>`;

    try {
      const data = await window.AppApi.adminUsers({
        search: state.search,
        status: state.status,
        role: state.role,
        page: state.page,
      });

      renderRows(data.users);

      const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
      const end = Math.min(data.page * data.pageSize, data.total);
      $('#admin-users-count').textContent = `${start}–${end} of ${data.total} user${data.total === 1 ? '' : 's'}`;

      $('#admin-users-prev').disabled = data.page <= 1;
      $('#admin-users-next').disabled = data.page >= data.totalPages;

      state.page = data.page;
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7"><div class="admin-empty-state"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(err.message || 'Could not load users')}</div></td></tr>`;
    }
  };

  const bindToolbar = () => {
    $('#admin-user-search').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        load();
      }, 300);
    });

    $('#admin-user-status-filter').addEventListener('change', (e) => {
      state.status = e.target.value;
      state.page = 1;
      load();
    });

    $('#admin-user-role-filter').addEventListener('change', (e) => {
      state.role = e.target.value;
      state.page = 1;
      load();
    });

    $('#admin-users-prev').addEventListener('click', () => {
      if (state.page > 1) { state.page -= 1; load(); }
    });
    $('#admin-users-next').addEventListener('click', () => {
      state.page += 1; load();
    });

    $('#admin-export-btn').addEventListener('click', (e) => {
      e.preventDefault();
      window.open(window.AppApi.adminUsersExportUrl(), '_blank');
    });
  };

  const bindRowActions = () => {
    $('#admin-users-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const { action, id } = btn.dataset;

      if (action === 'suspend') {
        btn.disabled = true;
        try {
          await window.AppApi.adminSuspendUser(id);
          window.AdminApp.showToast('User suspended');
          load();
        } catch (err) {
          window.AdminApp.showToast(err.message || 'Could not suspend user', 'error');
          btn.disabled = false;
        }
      }

      if (action === 'enable') {
        btn.disabled = true;
        try {
          await window.AppApi.adminEnableUser(id);
          window.AdminApp.showToast('User re-enabled');
          load();
        } catch (err) {
          window.AdminApp.showToast(err.message || 'Could not enable user', 'error');
          btn.disabled = false;
        }
      }

      if (action === 'delete') {
        const email = btn.dataset.email || 'this user';
        if (!window.confirm(`Delete ${email}? This permanently removes their account. This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await window.AppApi.adminDeleteUser(id);
          window.AdminApp.showToast('User deleted');
          load();
        } catch (err) {
          window.AdminApp.showToast(err.message || 'Could not delete user', 'error');
          btn.disabled = false;
        }
      }

      if (action === 'reset-conversations') {
        if (!window.confirm("Clear this user's local chat history on their next visit?")) return;
        btn.disabled = true;
        try {
          await window.AppApi.adminResetConversations(id);
          window.AdminApp.showToast('Conversations will be cleared on their next visit');
        } catch (err) {
          window.AdminApp.showToast(err.message || 'Could not reset conversations', 'error');
        } finally {
          btn.disabled = false;
        }
      }

      if (action === 'reset-tokens') {
        if (!window.confirm("Reset this user's usage counters?")) return;
        btn.disabled = true;
        try {
          await window.AppApi.adminResetTokens(id);
          window.AdminApp.showToast('Usage counters reset');
          load();
        } catch (err) {
          window.AdminApp.showToast(err.message || 'Could not reset usage', 'error');
        } finally {
          btn.disabled = false;
        }
      }

      if (action === 'view-memory') {
        openMemoryModal(id, btn.dataset.email || 'this user');
      }
    });
  };

  /* ---- Memory modal ---- */
  const openMemoryModal = async (userId, email) => {
    const overlay = $('#admin-memory-modal');
    const body = $('#admin-memory-body');
    const title = $('#admin-memory-title');
    const resetBtn = $('#admin-memory-reset-btn');

    title.textContent = `Memory — ${email}`;
    body.innerHTML = 'Loading…';
    overlay.style.display = 'flex';

    try {
      const data = await window.AppApi.adminGetMemory(userId);

      if (!data.memoryEnabled) {
        body.innerHTML = '<p>Long-term memory is disabled on this server (<code>MEMORY_ENABLED=false</code>).</p>';
      } else if (!data.summary && !data.facts.length) {
        body.innerHTML = "<p>No memory recorded yet — it builds up automatically as this person chats.</p>";
      } else {
        body.innerHTML = `
          ${data.summary ? `<p><strong>Summary:</strong> ${escapeHtml(data.summary)}</p>` : ''}
          ${data.facts.length ? `<p><strong>Known facts:</strong></p><ul>${data.facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
          ${data.topics.length ? `<p><strong>Frequent topics:</strong> ${data.topics.map(([t, c]) => `${escapeHtml(t)} (${c})`).join(', ')}</p>` : ''}
        `;
      }

      resetBtn.onclick = async () => {
        if (!window.confirm(`Permanently clear all remembered facts for ${email}?`)) return;
        resetBtn.disabled = true;
        try {
          await window.AppApi.adminResetMemory(userId);
          window.AdminApp.showToast('Memory reset');
          overlay.style.display = 'none';
        } catch (err) {
          window.AdminApp.showToast(err.message || 'Could not reset memory', 'error');
        } finally {
          resetBtn.disabled = false;
        }
      };
    } catch (err) {
      body.innerHTML = `<p>${escapeHtml(err.message || 'Could not load memory')}</p>`;
    }
  };

  const bindMemoryModal = () => {
    $('#admin-memory-close')?.addEventListener('click', () => { $('#admin-memory-modal').style.display = 'none'; });
    $('#admin-memory-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'admin-memory-modal') $('#admin-memory-modal').style.display = 'none';
    });
  };

  const refresh = () => load();

  const init = () => {
    bindToolbar();
    bindRowActions();
    bindMemoryModal();
  };

  init();

  return { refresh };
})();
