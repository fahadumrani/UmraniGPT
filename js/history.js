/* ============================================
   UMRANIGPT - Chat History Manager
   ============================================ */
'use strict';

window.AppHistory = (() => {
  const { emit, generateId, extractChatTitle, formatDate } = window.AppUtils;

  let currentChatId = null;

  /* ---- Create new chat ---- */
  const create = (opts = {}) => {
    const id = opts.id || generateId();
    const chat = {
      id,
      title: opts.title || 'New Chat',
      messages: opts.messages || [],
      createdAt: opts.createdAt || Date.now(),
      updatedAt: Date.now(),
      tags: opts.tags || [],
      pinned: false,
      favourite: false,
      archived: false,
    };
    AppStorage.saveChat(chat);
    return chat;
  };

  /* ---- Load chat ---- */
  const load = (id) => {
    if (!id) return null;
    const chat = AppStorage.getChat(id);
    if (!chat) return null;
    currentChatId = id;
    AppStorage.setCurrentChatId(id);
    emit('chatLoaded', { chat });
    return chat;
  };

  /* ---- Save current chat state ---- */
  const save = (chat) => {
    if (!chat) return;
    chat.updatedAt = Date.now();
    AppStorage.saveChat(chat);
  };

  /* ---- Update title from first message ---- */
  const updateTitle = (chatId, messages) => {
    const chat = AppStorage.getChat(chatId);
    if (!chat) return;

    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser && chat.title === 'New Chat') {
      chat.title = extractChatTitle(firstUser.content);
      AppStorage.saveChat(chat);
    }
  };

  /* ---- Get all chats grouped ---- */
  const getGrouped = () => {
    const all = AppStorage.getAllChats().filter(c => !c.archived);
    const pinned = AppStorage.getPinned();
    const favIds = AppStorage.getFavourites();

    const pinnedChats = pinned.map(id => all.find(c => c.id === id)).filter(Boolean);
    const rest = all.filter(c => !pinned.includes(c.id));

    // Group by time
    const now = Date.now();
    const groups = {
      pinned: pinnedChats,
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    rest.forEach(chat => {
      const diff = now - chat.updatedAt;
      const days = diff / 86400000;
      if (days < 1) groups.today.push(chat);
      else if (days < 2) groups.yesterday.push(chat);
      else if (days < 7) groups.thisWeek.push(chat);
      else groups.older.push(chat);
    });

    return groups;
  };

  /* ---- Delete chat ---- */
  const deleteChat = (id) => {
    AppStorage.deleteChat(id);
    AppStorage.unpinChat(id);
    const favs = AppStorage.getFavourites().filter(f => f !== id);
    AppStorage.setFavourites(favs);

    if (currentChatId === id) {
      currentChatId = null;
      AppStorage.setCurrentChatId(null);
    }

    emit('chatDeleted', { id });
  };

  /* ---- Rename chat ---- */
  const rename = (id, newTitle) => {
    const chat = AppStorage.getChat(id);
    if (!chat) return;
    chat.title = newTitle.trim() || 'Untitled';
    chat.updatedAt = Date.now();
    AppStorage.saveChat(chat);
    emit('chatRenamed', { id, title: chat.title });
  };

  /* ---- Duplicate chat ---- */
  const duplicate = (id) => {
    const orig = AppStorage.getChat(id);
    if (!orig) return null;
    const copy = create({
      title: `${orig.title} (Copy)`,
      messages: [...(orig.messages || [])],
      model: orig.model,
    });
    emit('chatDuplicated', { original: id, copy });
    return copy;
  };

  /* ---- Archive / unarchive ---- */
  const archive = (id) => {
    const chat = AppStorage.getChat(id);
    if (!chat) return;
    chat.archived = !chat.archived;
    AppStorage.saveChat(chat);
    emit('chatArchived', { id, archived: chat.archived });
  };

  /* ---- Export chat ---- */
  const exportChat = (id, format = 'json') => {
    const chat = AppStorage.getChat(id);
    if (!chat) return;

    let content, filename, type;

    if (format === 'json') {
      content = JSON.stringify(chat, null, 2);
      filename = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.json`;
      type = 'application/json';
    } else if (format === 'markdown') {
      content = chatToMarkdown(chat);
      filename = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.md`;
      type = 'text/markdown';
    } else if (format === 'txt') {
      content = chatToText(chat);
      filename = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
      type = 'text/plain';
    }

    AppUtils.downloadFile(content, filename, type);
  };

  /* ---- Export all chats ---- */
  const exportAll = () => {
    const data = AppStorage.exportAllData();
    const content = JSON.stringify(data, null, 2);
    const filename = `umranigpt-backup-${new Date().toISOString().split('T')[0]}.json`;
    AppUtils.downloadFile(content, filename, 'application/json');
  };

  /* ---- Import chat(s) ---- */
  const importChats = async (file) => {
    const text = await AppUtils.readFileAsText(file);
    const data = AppUtils.safeJsonParse(text);
    if (!data) return { ok: false, error: 'Invalid JSON file' };

    // Single chat
    if (data.id && data.messages) {
      const id = generateId();
      const chat = { ...data, id, importedAt: Date.now() };
      AppStorage.saveChat(chat);
      emit('chatImported', { chat });
      return { ok: true, count: 1 };
    }

    // Full backup
    if (data.chats) {
      const ok = AppStorage.importData(data);
      if (ok) emit('dataImported', { data });
      return { ok, count: data.chats.length };
    }

    return { ok: false, error: 'Unrecognised format' };
  };

  /* ---- Add message to chat ---- */
  const addMessage = (chatId, message) => {
    const chat = AppStorage.getChat(chatId);
    if (!chat) return;
    if (!chat.messages) chat.messages = [];
    chat.messages.push(message);
    save(chat);
    return chat;
  };

  /* ---- Update last message (streaming) ---- */
  const updateLastMessage = (chatId, content, meta = {}) => {
    const chat = AppStorage.getChat(chatId);
    if (!chat || !chat.messages?.length) return;
    const last = chat.messages[chat.messages.length - 1];
    last.content = content;
    if (meta.tokens) last.tokens = meta.tokens;
    if (meta.duration) last.duration = meta.duration;
    save(chat);
  };

  /* ---- Delete message ---- */
  const deleteMessage = (chatId, msgId) => {
    const chat = AppStorage.getChat(chatId);
    if (!chat) return;
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    save(chat);
    emit('messageDeleted', { chatId, msgId });
  };

  /* ---- Edit message ---- */
  const editMessage = (chatId, msgId, newContent) => {
    const chat = AppStorage.getChat(chatId);
    if (!chat) return;
    const msg = chat.messages.find(m => m.id === msgId);
    if (!msg) return;
    msg.content = newContent;
    msg.edited = true;
    msg.editedAt = Date.now();
    save(chat);
    emit('messageEdited', { chatId, msgId, content: newContent });
  };

  /* ---- Conversion helpers ---- */
  const chatToMarkdown = (chat) => {
    let md = `# ${chat.title}\n\n`;
    md += `> Model: ${chat.model || 'Unknown'} | Created: ${new Date(chat.createdAt).toLocaleString()}\n\n`;
    md += '---\n\n';
    (chat.messages || []).forEach(m => {
      const role = m.role === 'user' ? '**You**' : '**Assistant**';
      md += `${role}\n\n${m.content}\n\n---\n\n`;
    });
    return md;
  };

  const chatToText = (chat) => {
    let txt = `${chat.title}\n${'='.repeat(chat.title.length)}\n\n`;
    (chat.messages || []).forEach(m => {
      const role = m.role === 'user' ? 'You' : 'Assistant';
      txt += `[${role}]\n${m.content}\n\n`;
    });
    return txt;
  };

  /* ---- Search messages ---- */
  const search = (query) => {
    if (!query) return [];
    const q = query.toLowerCase();
    const results = [];
    AppStorage.getAllChats().forEach(chat => {
      if (chat.archived) return;
      (chat.messages || []).forEach(msg => {
        if (msg.content?.toLowerCase().includes(q)) {
          results.push({
            chatId: chat.id,
            chatTitle: chat.title,
            message: msg,
            snippet: getSnippet(msg.content, q),
          });
        }
      });
      if (chat.title?.toLowerCase().includes(q)) {
        results.push({
          chatId: chat.id,
          chatTitle: chat.title,
          message: null,
          snippet: chat.title,
          titleMatch: true,
        });
      }
    });
    return results;
  };

  const getSnippet = (text, query, radius = 80) => {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, radius * 2);
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + query.length + radius);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
  };

  const getCurrentId = () => currentChatId;
  const setCurrentId = (id) => {
    currentChatId = id;
    if (id) AppStorage.setCurrentChatId(id);
  };

  const init = () => {
    currentChatId = AppStorage.getCurrentChatId();
  };

  return {
    init, create, load, save, updateTitle,
    getGrouped, deleteChat, rename, duplicate, archive,
    exportChat, exportAll, importChats,
    addMessage, updateLastMessage, deleteMessage, editMessage,
    search, getCurrentId, setCurrentId, chatToMarkdown, chatToText,
  };
})();
