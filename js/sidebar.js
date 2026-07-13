/* ============================================
   UMRANIGPT - Sidebar Manager
   ============================================ */
'use strict';

window.AppSidebar = (() => {
  const { $, $$, emit, formatDate, escapeHtml, truncate, on } = window.AppUtils;

  let sidebarEl, isOpen, isResizing = false;
  let contextMenu = null;

  /* ---- Init ---- */
  const init = () => {
    sidebarEl = document.getElementById('sidebar');

    const savedOpen = AppStorage.getSidebarOpen();
    isOpen = savedOpen !== false;
    if (!isOpen) collapse(false);

    // Restore saved width
    const savedWidth = AppStorage.getSidebarWidth();
    if (savedWidth && isOpen) sidebarEl.style.width = `${savedWidth}px`;

    bindToggle();
    bindResizeHandle();
    bindNewChat();
    bindSearch();
    bindFooter();
    bindContextMenu();
    renderAll();

    // Event subscriptions
    on('chatLoaded',    () => renderAll());
    on('chatDeleted',   () => renderAll());
    on('chatRenamed',   () => renderAll());
    on('chatDuplicated',() => renderAll());
    on('chatArchived',  () => renderAll());
    on('historyCleared',() => renderAll());
    on('dataImported',  () => renderAll());
    on('messageSent',   () => renderAll());
    on('action:toggleSidebar', () => toggle());
    on('action:closeMobileSidebar', () => closeMobile());

    // Mobile overlay
    const overlay = document.querySelector('.overlay');
    overlay?.addEventListener('click', closeMobile);
  };

  /* ---- Toggle ---- */
  const toggle = () => {
    if (window.innerWidth <= 768) {
      toggleMobile();
    } else {
      isOpen ? collapse() : expand();
    }
  };

  const expand = (save = true) => {
    isOpen = true;
    sidebarEl?.classList.remove('collapsed');
    if (save) AppStorage.setSidebarOpen(true);
    emit('sidebarToggled', { open: true });
  };

  const collapse = (save = true) => {
    isOpen = false;
    sidebarEl?.classList.add('collapsed');
    if (save) AppStorage.setSidebarOpen(false);
    emit('sidebarToggled', { open: false });
  };

  const toggleMobile = () => {
    const isOpenMobile = sidebarEl?.classList.contains('mobile-open');
    if (isOpenMobile) closeMobile();
    else openMobile();
  };

  const openMobile = () => {
    sidebarEl?.classList.add('mobile-open');
    document.querySelector('.overlay')?.classList.add('visible');
  };

  const closeMobile = () => {
    sidebarEl?.classList.remove('mobile-open');
    document.querySelector('.overlay')?.classList.remove('visible');
  };

  /* ---- Resize handle ---- */
  const bindResizeHandle = () => {
    const handle = sidebarEl?.querySelector('.resize-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      handle.classList.add('dragging');
      // Disable CSS transitions during drag — they cause visible lag
      // when the sidebar width changes many times per second.
      if (sidebarEl) sidebarEl.style.transition = 'none';
      document.addEventListener('mousemove', onResize);
      document.addEventListener('mouseup', stopResize);
      e.preventDefault();
    });
  };

  const onResize = (e) => {
    if (!isResizing) return;
    const newWidth = AppUtils.clamp(e.clientX,
      AppConfig.SIDEBAR_MIN_WIDTH, AppConfig.SIDEBAR_MAX_WIDTH);
    sidebarEl.style.width    = `${newWidth}px`;
    sidebarEl.style.minWidth = `${newWidth}px`;
  };

  const stopResize = () => {
    isResizing = false;
    // Re-enable transitions after drag ends
    if (sidebarEl) sidebarEl.style.transition = '';
    sidebarEl?.querySelector('.resize-handle')?.classList.remove('dragging');
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    const width = parseInt(sidebarEl?.style.width) || AppConfig.SIDEBAR_MIN_WIDTH;
    AppStorage.setSidebarWidth(width);
  };

  /* ---- Sidebar toggle button ---- */
  const bindToggle = () => {
    $('#sidebar-toggle-btn')?.addEventListener('click', toggle);
    $('#mobile-menu-btn')?.addEventListener('click', toggle);
  };

  /* ---- New Chat ---- */
  const bindNewChat = () => {
    $('#new-chat-btn')?.addEventListener('click', () => emit('action:newChat', {}));
  };

  /* ---- Search ---- */
  const bindSearch = () => {
    const input = $('#sidebar-search-input');
    AppSearch.bindSidebarSearch(input);
  };

  /* ---- Footer ---- */
  const bindFooter = () => {
    $('#settings-footer-btn')?.addEventListener('click', () => AppSettings.open());
    $('#theme-footer-btn')?.addEventListener('click', () => {
      const theme = AppTheme.cycle();
      AppNotifications.info(`Theme: ${AppTheme.getThemeName(theme)}`);
    });
    $('#shortcuts-footer-btn')?.addEventListener('click', () => AppShortcuts.showShortcutsModal());
    $('#export-all-footer-btn')?.addEventListener('click', () => AppHistory.exportAll());
    $('#logout-footer-btn')?.addEventListener('click', () => AppAuth.logout());
  };

  /* ---- Render all lists ---- */
  const renderAll = () => {
    const grouped = AppHistory.getGrouped();
    renderSection('pinned-list',    grouped.pinned,    true);
    renderSection('today-list',     grouped.today,     false, 'Today');
    renderSection('yesterday-list', grouped.yesterday, false, 'Yesterday');
    renderSection('week-list',      grouped.thisWeek,  false, 'This Week');
    renderSection('older-list',     grouped.older,     false, 'Older');
  };

  const renderSection = (listId, chats, isPinned, label) => {
    const section = document.getElementById(`section-${listId.replace('-list', '')}`);
    const list = document.getElementById(listId);
    if (!list) return;

    if (!chats || chats.length === 0) {
      if (section) section.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    if (section) section.style.display = '';
    list.innerHTML = '';

    chats.forEach((chat, i) => {
      const item = createChatItem(chat, isPinned);
      item.style.animationDelay = `${i * 30}ms`;
      list.appendChild(item);
    });
  };

  /* ---- Create chat list item ---- */
  const createChatItem = (chat, isPinned = false) => {
    const currentId = AppHistory.getCurrentId();
    const isActive = chat.id === currentId;
    const isFav = AppStorage.isChatFavourite(chat.id);

    const item = document.createElement('div');
    item.className = `chat-item animate-fade-in ${isActive ? 'active' : ''}`;
    item.dataset.id = chat.id;
    item.dataset.title = chat.title;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Chat: ${chat.title}`);

    item.innerHTML = `
      <i class="chat-item-icon fa-solid ${isPinned ? 'fa-thumbtack' : 'fa-message'}"></i>
      <span class="chat-item-title">${escapeHtml(truncate(chat.title, 32))}</span>
      <span class="chat-item-time">${formatDate(chat.updatedAt)}</span>
      <div class="chat-item-actions">
        ${isFav ? '<span class="chat-item-pinned-badge" title="Favourite">❤️</span>' : ''}
        <button class="chat-item-btn" data-action="more" title="More options" aria-label="More options">
          <i class="fa-solid fa-ellipsis"></i>
        </button>
      </div>
    `;

    // Click to load
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      loadChat(chat.id);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadChat(chat.id);
      }
    });

    // More button → context menu
    item.querySelector('[data-action="more"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(e, chat, isPinned);
    });

    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, chat, isPinned);
    });

    return item;
  };

  /* ---- Load chat ---- */
  const loadChat = (id) => {
    const chat = AppHistory.load(id);
    if (chat) {
      emit('chatSelected', { chat });
      if (window.innerWidth <= 768) closeMobile();
      // Highlight active
      $$('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    }
  };

  /* ---- Context Menu ---- */
  const bindContextMenu = () => {
    contextMenu = document.getElementById('context-menu');
    document.addEventListener('click', () => hideContextMenu());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });
  };

  const showContextMenu = (e, chat, isPinned) => {
    if (!contextMenu) return;
    const pinned = AppStorage.isChatPinned(chat.id);
    const fav = AppStorage.isChatFavourite(chat.id);

    contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="rename"><i class="fa-solid fa-pen"></i> Rename</div>
      <div class="context-menu-item" data-action="duplicate"><i class="fa-solid fa-copy"></i> Duplicate</div>
      <div class="context-menu-item" data-action="pin"><i class="fa-solid fa-thumbtack"></i> ${pinned ? 'Unpin' : 'Pin'}</div>
      <div class="context-menu-item" data-action="favourite"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i> ${fav ? 'Remove favourite' : 'Add to favourites'}</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="export-json"><i class="fa-solid fa-download"></i> Export JSON</div>
      <div class="context-menu-item" data-action="export-md"><i class="fa-brands fa-markdown"></i> Export Markdown</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="archive"><i class="fa-solid fa-box-archive"></i> Archive</div>
      <div class="context-menu-item danger" data-action="delete"><i class="fa-solid fa-trash"></i> Delete</div>
    `;

    // Position
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('visible');

    // Bind actions
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleContextAction(item.dataset.action, chat);
        hideContextMenu();
      });
    });
  };

  const hideContextMenu = () => {
    contextMenu?.classList.remove('visible');
  };

  const handleContextAction = (action, chat) => {
    switch (action) {
      case 'rename':   startRename(chat); break;
      case 'duplicate':
        AppHistory.duplicate(chat.id);
        AppNotifications.success('Duplicated', 'Chat duplicated.');
        renderAll();
        break;
      case 'pin':
        if (AppStorage.isChatPinned(chat.id)) AppStorage.unpinChat(chat.id);
        else AppStorage.pinChat(chat.id);
        renderAll();
        break;
      case 'favourite':
        AppStorage.toggleFavourite(chat.id);
        renderAll();
        break;
      case 'export-json': AppHistory.exportChat(chat.id, 'json'); break;
      case 'export-md':   AppHistory.exportChat(chat.id, 'markdown'); break;
      case 'archive':
        AppHistory.archive(chat.id);
        AppNotifications.info('Archived', 'Chat archived.');
        if (chat.id === AppHistory.getCurrentId()) emit('action:newChat', {});
        break;
      case 'delete':
        if (confirm(`Delete "${chat.title}"?`)) {
          AppHistory.deleteChat(chat.id);
          if (chat.id === AppHistory.getCurrentId()) emit('action:newChat', {});
        }
        break;
    }
  };

  /* ---- Inline rename ---- */
  const startRename = (chat) => {
    const item = sidebarEl?.querySelector(`.chat-item[data-id="${chat.id}"]`);
    if (!item) return;

    const titleEl = item.querySelector('.chat-item-title');
    const currentTitle = chat.title;

    const input = document.createElement('input');
    input.className = 'chat-item-rename';
    input.value = currentTitle;
    input.maxLength = 80;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = (save) => {
      if (save) {
        const newTitle = input.value.trim() || currentTitle;
        AppHistory.rename(chat.id, newTitle);
        item.dataset.title = newTitle;
      }
      input.replaceWith(titleEl);
      titleEl.textContent = save ? input.value.trim() || currentTitle : currentTitle;
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });

    input.addEventListener('blur', () => finish(true));
  };

  /* ---- Folder management ---- */
  const renderFolders = () => {
    const container = $('#folders-list');
    if (!container) return;

    const folders = AppStorage.getFolders();
    if (folders.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = '';
    folders.forEach(folder => {
      const chats = AppStorage.getAllChats().filter(c => folder.chatIds.includes(c.id));
      const folderEl = document.createElement('div');
      folderEl.className = 'folder-item';
      folderEl.innerHTML = `
        <i class="folder-item-icon fa-solid fa-folder"></i>
        <span class="folder-item-name">${escapeHtml(folder.name)} (${chats.length})</span>
        <i class="folder-item-toggle fa-solid fa-chevron-right"></i>
      `;
      container.appendChild(folderEl);
    });
  };

  return { init, toggle, expand, collapse, renderAll, loadChat };
})();
