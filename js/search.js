/* ============================================
   UMRANIGPT - Search Module
   ============================================ */
'use strict';

window.AppSearch = (() => {
  const { debounce, $, emit, highlightText } = window.AppUtils;

  let isOpen = false;
  let query = '';
  let results = [];
  let onSelectCallback = null;

  /* ---- Search chats/messages ---- */
  const search = (q) => {
    query = q.trim();
    if (!query) {
      results = [];
      emit('searchResults', { results: [], query: '' });
      return;
    }

    results = AppHistory.search(query);
    emit('searchResults', { results, query });
    return results;
  };

  const debouncedSearch = debounce(search, window.AppConfig.DEBOUNCE_DELAY);

  /* ---- Filter sidebar chat list ---- */
  const filterSidebar = (q) => {
    const items = document.querySelectorAll('.chat-item');
    const hasQuery = q.trim().length > 0;

    items.forEach(item => {
      if (!hasQuery) {
        item.style.display = '';
        const titleEl = item.querySelector('.chat-item-title');
        if (titleEl) titleEl.innerHTML = window.AppUtils.escapeHtml(titleEl.textContent);
        return;
      }

      const title = item.dataset.title || '';
      const match = title.toLowerCase().includes(q.toLowerCase());
      item.style.display = match ? '' : 'none';

      if (match) {
        const titleEl = item.querySelector('.chat-item-title');
        if (titleEl) {
          titleEl.innerHTML = highlightText(title, q);
        }
      }
    });

    // Show/hide section headers based on visible items
    document.querySelectorAll('.sidebar-section').forEach(section => {
      const visibleItems = section.querySelectorAll('.chat-item[style=""],.chat-item:not([style])');
      section.style.display = visibleItems.length === 0 ? 'none' : '';
    });
  };

  /* ---- Bind to search input ---- */
  const bindSidebarSearch = (inputEl) => {
    if (!inputEl) return;

    inputEl.addEventListener('input', (e) => {
      const q = e.target.value;
      filterSidebar(q);
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        inputEl.value = '';
        filterSidebar('');
        inputEl.blur();
      }
    });
  };

  /* ---- Highlight text in a container ---- */
  const highlightInContainer = (container, q) => {
    if (!container || !q) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;

      const text = textNode.textContent;
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      if (!re.test(text)) return;

      const span = document.createElement('span');
      span.innerHTML = highlightText(text, q);
      parent.replaceChild(span, textNode);
    });
  };

  const clearHighlights = (container) => {
    if (!container) return;
    container.querySelectorAll('.search-highlight').forEach(el => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
  };

  return {
    search, debouncedSearch, filterSidebar, bindSidebarSearch,
    highlightInContainer, clearHighlights,
    getResults: () => results,
    getQuery: () => query,
  };
})();
