/* ============================================================
   UMRANIGPT — Chat Engine
============================================================ */
'use strict';

window.AppChat = (() => {
  const { $, emit, on, generateId, isScrolledToBottom, scrollToBottom,
          escapeHtml, copyToClipboard, formatTime } = window.AppUtils;

  let currentChat    = null;
  let isGenerating   = false;
  let pendingFiles   = [];
  let streamBuffer   = '';
  let streamMsgEl    = null;
  let streamContentEl= null;
  let autoScroll     = true;

  /* Debounced markdown render during streaming — prevents per-token DOM
     repaint which was the biggest UI bottleneck on fast models.
     We update the DOM at most every 50ms; the final onDone call
     always does one last synchronous render of the complete text. */
  let _renderPending = false;
  let _renderTimer   = null;
  const scheduleRender = () => {
    if (_renderPending) return;
    _renderPending = true;
    _renderTimer = setTimeout(() => {
      _renderPending = false;
      if (streamContentEl && streamBuffer) {
        AppMarkdown.renderInto(streamContentEl, streamBuffer);
        addStreamingCursor(streamContentEl);
      }
    }, 48); // ~20fps
  };
  const flushRender = () => {
    clearTimeout(_renderTimer);
    _renderPending = false;
    if (streamContentEl && streamBuffer) {
      AppMarkdown.renderInto(streamContentEl, streamBuffer);
    }
  };

  /* ---- Init ---- */
  const init = () => {
    bindInput();
    bindSendButton();
    bindScrollButton();
    bindVoiceButton();
    bindStopButton();
    autoResizeTextarea();

    on('action:newChat',    () => newChat());
    on('chatSelected',      ({ chat }) => renderChat(chat));
    on('historyCleared',    () => newChat());
    on('dataImported',      () => { newChat(); AppSidebar.renderAll(); });
    on('fileAdded',         (files) => { pendingFiles.push(...files); });
    on('fileRemoved',       ({ name }) => { pendingFiles = pendingFiles.filter(f => f.name !== name); });
    on('action:stopStream', () => stopGeneration());
    on('action:exportChat', () => { if (currentChat) AppHistory.exportChat(currentChat.id); });
    on('action:prevChat',   () => navigateChats(-1));
    on('action:nextChat',   () => navigateChats(1));

    /* scroll tracking */
    const msgs = document.getElementById('messages');
    msgs?.addEventListener('scroll', AppUtils.throttle(() => {
      autoScroll = isScrolledToBottom(msgs);
      document.getElementById('scroll-btn')?.classList.toggle('visible', !autoScroll);
    }, 100));

    /* voice result → fill input */
    on('voiceResult', ({ transcript, final }) => {
      if (!final) return;
      const inp = $('#message-input');
      if (inp) { inp.value = (inp.value + ' ' + transcript).trim(); autoResize(inp); updateSendBtn(); }
    });

    /* restore last chat */
    const lastId = AppStorage.getCurrentChatId();
    if (lastId) {
      const chat = AppHistory.load(lastId);
      if (chat) renderChat(chat); else newChat();
    } else { newChat(); }
  };

  /* ---- New chat ---- */
  const newChat = () => {
    const chat = AppHistory.create();
    currentChat = chat;
    AppHistory.setCurrentId(chat.id);
    clearMessages();
    showWelcome();
    stopGeneration();
    pendingFiles = [];
    AppDragDrop.clearPreviews();
    AppSidebar.renderAll();
    document.getElementById('message-input')?.focus();
  };

  /* ---- Render existing chat ---- */
  const renderChat = (chat) => {
    currentChat = chat;
    clearMessages();
    hideWelcome();
    const msgs = chat.messages || [];
    if (!msgs.length) { showWelcome(); return; }
    const frag = document.createDocumentFragment();
    msgs.forEach((msg, i) => {
      const el = createMessageEl(msg, false);
      el.style.animationDelay = `${Math.min(i * 15, 200)}ms`;
      frag.appendChild(el);
    });
    document.getElementById('messages').appendChild(frag);
    scrollToBottom(document.getElementById('messages'), false);
  };

  /* ---- Send ---- */
  const send = async () => {
    const input = $('#message-input');
    if (!input || isGenerating) return;
    const text  = input.value.trim();
    const files = [...pendingFiles];
    if (!text && !files.length) return;

    input.value = '';
    autoResize(input);
    updateSendBtn();
    pendingFiles = [];
    AppDragDrop.clearPreviews();

    if (!currentChat) newChat();
    hideWelcome();

    /* build user message */
    const images   = files.filter(f => f.type === 'image').map(f => f.base64).filter(Boolean);
    const textParts= files.filter(f => f.type !== 'image' && f.content)
                          .map(f => `\n\n**File: ${f.name}**\n\`\`\`\n${f.content}\n\`\`\``);
    const fullText = text + textParts.join('');

    const userMsg = {
      id:         generateId(),
      role:       'user',
      content:    fullText,
      images:     images.length ? images : undefined,
      imageFiles: files.filter(f => f.type === 'image').map(f => ({ name: f.name, dataUrl: f.dataUrl })),
      timestamp:  Date.now(),
    };

    currentChat.messages = currentChat.messages || [];
    currentChat.messages.push(userMsg);
    AppHistory.save(currentChat);
    AppHistory.updateTitle(currentChat.id, currentChat.messages);
    appendMessage(userMsg, true);

    await generateAssistantResponse(currentChat.messages);
  };

  /* ============================================================
     Core response generator — used by send(), regenerate(), and
     the initial retry action. Never reads from the input box, so
     it works correctly when triggered from a message action
     button (previously "Retry" called send() with an empty input
     box and silently did nothing).
  ============================================================ */
  const generateAssistantResponse = async (conversationMessages) => {
    showTypingIndicator();
    isGenerating = true;
    updateStopBtn(true);

    const assistantMsg = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
    streamBuffer = '';

    try {
      await OllamaService.chat(
        conversationMessages,
        {
          onChunk: (chunk) => {
            removeTypingIndicator();
            streamBuffer += chunk;
            if (!streamMsgEl) {
              streamMsgEl     = appendMessage(assistantMsg, true);
              streamContentEl = streamMsgEl.querySelector('.message-content');
            }
            scheduleRender();
            if (autoScroll) requestAnimationFrame(() => scrollToBottom(document.getElementById('messages'), false));
          },
          onDone: (stats) => {
            clearTimeout(_renderTimer);
            removeStreamingCursor();
            flushRender();
            isGenerating = false;
            updateStopBtn(false);
            assistantMsg.content = streamBuffer;
            if (stats && !stats.aborted) {
              assistantMsg.tokens   = stats.totalTokens;
              assistantMsg.duration = stats.duration;
            }
            if (streamContentEl) AppMarkdown.renderInto(streamContentEl, streamBuffer);
            if (streamMsgEl && stats?.totalTokens) {
              const metaEl = streamMsgEl.querySelector('.message-model');
              if (metaEl) metaEl.textContent = `${stats.totalTokens} tokens`;
            }
            if (!stats?.aborted) {
              currentChat.messages.push(assistantMsg);
              AppHistory.save(currentChat);
            }
            streamMsgEl = streamContentEl = null;
            streamBuffer = '';
            AppSidebar.renderAll();
            emit('responseDone', { message: assistantMsg });
          },
          onError: (err) => {
            removeTypingIndicator();
            removeStreamingCursor();
            isGenerating = false;
            updateStopBtn(false);
            streamMsgEl = streamContentEl = null;
            streamBuffer = '';
            appendMessage({ id: generateId(), role: 'assistant', content: `**Error:** ${err.message || 'Something went wrong.'}`, error: true, timestamp: Date.now() }, true);
            AppNotifications.error('Generation failed', err.message || 'Unknown error');
          },
        }
      );
    } catch (err) {
      removeTypingIndicator();
      isGenerating = false;
      updateStopBtn(false);
      AppNotifications.error('Error', err.message || 'Failed to send');
    }
  };

  /* ---- Stop ---- */
  const stopGeneration = () => {
    if (!isGenerating) return;
    OllamaService.abort();
    isGenerating = false;
    updateStopBtn(false);
    removeTypingIndicator();
    clearTimeout(_renderTimer);
    _renderPending = false;
    removeStreamingCursor();
    if (streamBuffer && currentChat) {
      flushRender();
      currentChat.messages.push({ id: generateId(), role: 'assistant', content: streamBuffer, timestamp: Date.now(), stopped: true });
      AppHistory.save(currentChat);
      AppSidebar.renderAll();
    }
    streamMsgEl = streamContentEl = null;
    streamBuffer = '';
  };

  /* ---- Regenerate — replaces an assistant reply with a fresh one,
     using the same conversation context up to that point. Unlike the
     old "retry" (which relied on the input box and silently failed),
     this calls generateAssistantResponse() directly. ---- */
  const regenerate = (msgId) => {
    if (!currentChat || isGenerating) return;
    const msgs = currentChat.messages;
    const idx  = msgs.findIndex(m => m.id === msgId);
    if (idx === -1 || msgs[idx].role !== 'assistant') return;

    const gone = msgs.splice(idx); // remove this assistant message (and anything after it)
    AppHistory.save(currentChat);
    gone.forEach(m => document.querySelector(`.message-wrapper[data-id="${m.id}"]`)?.remove());

    if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user') return; // nothing to regenerate from
    generateAssistantResponse(msgs);
  };

  /* Backward-compatible alias — old code / tests may still call retry() */
  const retry = (msgId) => regenerate(msgId);

  /* ---- Continue Generation — asks the model to continue an
     existing (possibly truncated/stopped) assistant reply, and
     appends the new text onto the same message rather than
     starting a fresh one. ---- */
  const continueGeneration = async (msgId) => {
    if (!currentChat || isGenerating) return;
    const msg = currentChat.messages.find(m => m.id === msgId);
    if (!msg || msg.role !== 'assistant') return;

    const wrapper = document.querySelector(`.message-wrapper[data-id="${msgId}"]`);
    const contentEl = wrapper?.querySelector('.message-content');
    if (!contentEl) return;

    showTypingIndicator();
    isGenerating = true;
    updateStopBtn(true);

    const priorContent = msg.content;
    streamBuffer = priorContent;
    streamContentEl = contentEl;
    streamMsgEl = wrapper;

    // Build a conversation where the assistant's partial reply is
    // included, followed by an instruction to continue it.
    const idx = currentChat.messages.findIndex(m => m.id === msgId);
    const contextMessages = currentChat.messages.slice(0, idx + 1).concat([
      { role: 'user', content: 'Continue your previous reply exactly where you left off. Do not repeat what you already said, do not add any preamble — just continue the text.' },
    ]);

    try {
      await OllamaService.chat(contextMessages, {
        onChunk: (chunk) => {
          removeTypingIndicator();
          streamBuffer += chunk;
          scheduleRender();
          if (autoScroll) requestAnimationFrame(() => scrollToBottom(document.getElementById('messages'), false));
        },
        onDone: (stats) => {
          clearTimeout(_renderTimer);
          removeStreamingCursor();
          flushRender();
          isGenerating = false;
          updateStopBtn(false);
          msg.content = streamBuffer;
          msg.tokens  = (msg.tokens || 0) + (stats?.totalTokens || 0);
          delete msg.stopped;
          AppHistory.save(currentChat);
          streamMsgEl = streamContentEl = null;
          streamBuffer = '';
          AppSidebar.renderAll();
        },
        onError: (err) => {
          removeTypingIndicator();
          removeStreamingCursor();
          isGenerating = false;
          updateStopBtn(false);
          streamMsgEl = streamContentEl = null;
          streamBuffer = '';
          AppNotifications.error('Continue failed', err.message || 'Unknown error');
        },
      });
    } catch (err) {
      removeTypingIndicator();
      isGenerating = false;
      updateStopBtn(false);
      AppNotifications.error('Error', err.message || 'Failed to continue');
    }
  };

  /* ---- Edit message ---- */
  const editMessage = (msgId) => {
    if (!currentChat) return;
    const msg = currentChat.messages.find(m => m.id === msgId);
    if (!msg || msg.role !== 'user') return;
    const inp = $('#message-input');
    if (!inp) return;
    inp.value = msg.content;
    autoResize(inp); updateSendBtn(); inp.focus();
    const idx  = currentChat.messages.findIndex(m => m.id === msgId);
    const gone = currentChat.messages.splice(idx);
    AppHistory.save(currentChat);
    gone.forEach(m => document.querySelector(`.message-wrapper[data-id="${m.id}"]`)?.remove());
  };

  /* ---- Append ---- */
  const appendMessage = (msg, animate = true) => {
    const el = createMessageEl(msg, animate);
    document.getElementById('messages').appendChild(el);
    if (autoScroll) scrollToBottom(document.getElementById('messages'), false);
    hideWelcome();
    return el;
  };

  /* ---- Create message element ---- */
  const createMessageEl = (msg, animate = false) => {
    const isUser   = msg.role === 'user';
    const isSystem = msg.role === 'system';
    const settings = AppStorage.getSettings();

    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${msg.role}`;
    wrapper.dataset.id = msg.id;
    if (!animate) { wrapper.style.animation = 'none'; wrapper.style.opacity = '1'; }

    if (isSystem) {
      wrapper.innerHTML = `<div class="system-message"><i class="fa-solid fa-circle-info"></i>${escapeHtml(msg.content)}</div>`;
      return wrapper;
    }

    const avatarHtml = isUser
      ? `<div class="msg-avatar user-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></div>`
      : `<div class="msg-avatar ai-avatar"   aria-hidden="true"><i class="fa-solid fa-robot"></i></div>`;

    const timeStr   = formatTime(msg.timestamp || Date.now());
    const metaParts = [msg.model, msg.tokens ? `${msg.tokens} tokens` : ''].filter(Boolean);
    const filesHtml = buildFilesHtml(msg);

    let contentHtml;
    if (msg.error) {
      contentHtml = `<div class="message-error"><i class="fa-solid fa-circle-exclamation"></i>${msg.content}</div>`;
    } else if (isUser) {
      contentHtml = `<div class="message-content">${escapeHtml(msg.content).replace(/\n/g,'<br>')}</div>`;
    } else {
      contentHtml = `<div class="message-content"></div>`;
    }

    wrapper.innerHTML = `
      <div class="message-row">
        ${!isUser ? avatarHtml : ''}
        <div style="flex:1;min-width:0;">
          ${filesHtml}
          <div class="message-bubble">${contentHtml}</div>
          <div class="message-meta" ${settings.showTimestamps ? '' : 'style="display:none"'}>
            <span class="message-time">${timeStr}</span>
            ${metaParts.length ? `<span class="message-model" style="color:var(--text-muted);font-size:10px;">${escapeHtml(metaParts.join(' · '))}</span>` : ''}
            ${msg.edited ? '<span class="edited-badge">(edited)</span>' : ''}
          </div>
          <div class="message-actions">${buildActions(msg, isUser)}</div>
          <div class="message-reactions" id="reactions-${msg.id}"></div>
        </div>
        ${isUser ? avatarHtml : ''}
      </div>`;

    if (!isUser && !msg.error && msg.content) {
      AppMarkdown.renderInto(wrapper.querySelector('.message-content'), msg.content);
    }

    bindActions(wrapper, msg);
    return wrapper;
  };

  const buildFilesHtml = (msg) => {
    if (!msg.imageFiles?.length) return '';
    return `<div class="message-files">${msg.imageFiles.map(f =>
      `<img class="message-file-thumb" src="${f.dataUrl}" alt="${escapeHtml(f.name)}" loading="lazy"
            onclick="AppMarkdown.openLightbox('${f.dataUrl}')">`).join('')}</div>`;
  };

  const buildActions = (msg, isUser) => [
    `<button class="msg-action-btn" data-action="copy"   title="Copy"><i class="fa-regular fa-copy"></i></button>`,
    isUser
      ? `<button class="msg-action-btn" data-action="edit"   title="Edit"><i class="fa-solid fa-pen"></i></button>`
      : `<button class="msg-action-btn" data-action="speak"      title="Read aloud"><i class="fa-solid fa-volume-high"></i></button>
         <button class="msg-action-btn" data-action="regenerate" title="Regenerate response"><i class="fa-solid fa-rotate"></i></button>
         ${msg.stopped ? `<button class="msg-action-btn" data-action="continue" title="Continue generating"><i class="fa-solid fa-forward"></i></button>` : ''}`,
    `<button class="msg-action-btn" data-action="react"  title="React"><i class="fa-regular fa-face-smile"></i></button>`,
    `<button class="msg-action-btn danger" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>`,
  ].join('');

  const bindActions = (wrapper, msg) => {
    wrapper.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        switch (btn.dataset.action) {
          case 'copy':
            const txt = wrapper.querySelector('.message-content')?.textContent || msg.content;
            if (await copyToClipboard(txt)) {
              btn.innerHTML = '<i class="fa-solid fa-check"></i>';
              setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
              AppNotifications.success('Copied');
            }
            break;
          case 'edit':       editMessage(msg.id); break;
          case 'regenerate': regenerate(msg.id); break;
          case 'continue':   continueGeneration(msg.id); break;
          case 'delete':
            wrapper.style.cssText += ';opacity:0;transform:translateY(-4px);transition:all 0.2s ease;';
            setTimeout(() => {
              wrapper.remove();
              if (currentChat) AppHistory.deleteMessage(currentChat.id, msg.id);
              if (!document.getElementById('messages')?.children.length) showWelcome();
            }, 200);
            break;
          case 'speak':
            AppVoice.isTalking() ? AppVoice.stopSpeaking() : AppVoice.speak(msg.content);
            break;
          case 'react':  showReactionPicker(wrapper, msg); break;
        }
      });
    });
  };

  /* ---- Reaction picker ---- */
  const showReactionPicker = (wrapper, msg) => {
    document.querySelector('.reaction-picker')?.remove();
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = 'position:fixed;z-index:400;background:var(--surface-2);border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:8px;display:flex;gap:6px;box-shadow:var(--shadow-md);backdrop-filter:var(--backdrop-blur);';
    AppConfig.REACTIONS.forEach(emoji => {
      const b = document.createElement('button');
      b.textContent = emoji;
      b.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;padding:4px;border-radius:6px;transition:transform 0.15s;';
      b.onmouseenter = () => b.style.transform = 'scale(1.3)';
      b.onmouseleave = () => b.style.transform = '';
      b.onclick = () => { addReaction(wrapper, msg.id, emoji); picker.remove(); };
      picker.appendChild(b);
    });
    const rect = wrapper.getBoundingClientRect();
    picker.style.top  = `${Math.min(rect.bottom + 4, window.innerHeight - 60)}px`;
    picker.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
    document.body.appendChild(picker);
    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 10);
  };

  const addReaction = (wrapper, msgId, emoji) => {
    const container = wrapper.querySelector(`#reactions-${msgId}`);
    if (!container) return;
    const existing = [...container.querySelectorAll('.reaction-badge')].find(b => b.dataset.emoji === emoji);
    if (existing) {
      const span = existing.querySelector('span');
      const n = parseInt(span?.textContent || '1');
      if (n > 1) span.textContent = n - 1; else existing.remove();
      return;
    }
    const badge = document.createElement('div');
    badge.className = 'reaction-badge active';
    badge.dataset.emoji = emoji;
    badge.innerHTML = `${emoji}<span>1</span>`;
    badge.onclick = () => addReaction(wrapper, msgId, emoji);
    container.appendChild(badge);
  };

  /* ---- Typing indicator ---- */
  const showTypingIndicator = () => {
    removeTypingIndicator();
    const el = document.createElement('div');
    el.className = 'typing-indicator'; el.id = 'typing-indicator';
    el.innerHTML = `<div class="msg-avatar ai-avatar"><i class="fa-solid fa-robot"></i></div>
      <div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    document.getElementById('messages').appendChild(el);
    if (autoScroll) scrollToBottom(document.getElementById('messages'), false);
  };
  const removeTypingIndicator = () => document.getElementById('typing-indicator')?.remove();

  /* ---- Streaming cursor ---- */
  const addStreamingCursor = (el) => {
    if (!el || el.querySelector('.streaming-cursor')) return;
    const c = document.createElement('span'); c.className = 'streaming-cursor';
    el.appendChild(c);
  };
  const removeStreamingCursor = () => document.querySelectorAll('.streaming-cursor').forEach(e => e.remove());

  /* ---- Welcome screen ---- */
  const showWelcome = () => {
    const ws = document.getElementById('welcome-screen');
    ws?.classList.remove('hidden');
    renderSuggestions();
  };
  const hideWelcome = () => document.getElementById('welcome-screen')?.classList.add('hidden');

  const renderSuggestions = () => {
    const grid = document.querySelector('.suggestion-grid');
    if (!grid || grid.dataset.rendered) return;
    grid.dataset.rendered = '1';
    AppConfig.SUGGESTIONS.forEach((s, i) => {
      const card = document.createElement('button');
      card.className = 'suggestion-card';
      card.style.animationDelay = `${i * 80 + 200}ms`;
      card.innerHTML = `<i class="fa-solid ${s.icon} suggestion-icon"></i>
        <span class="suggestion-title">${escapeHtml(s.title)}</span>
        <span class="suggestion-desc">${escapeHtml(s.desc)}</span>`;
      card.onclick = () => {
        const inp = document.getElementById('message-input');
        if (inp) { inp.value = s.title; autoResize(inp); updateSendBtn(); inp.focus(); }
      };
      grid.appendChild(card);
    });
  };

  /* ---- Clear ---- */
  const clearMessages = () => {
    const msgs = document.getElementById('messages');
    if (msgs) msgs.innerHTML = '';
    removeTypingIndicator(); removeStreamingCursor();
    streamMsgEl = streamContentEl = null; streamBuffer = '';
  };

  /* ---- Input ---- */
  const bindInput = () => {
    const inp = $('#message-input');
    if (!inp) return;
    inp.addEventListener('input', () => { autoResize(inp); updateSendBtn(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || (!e.shiftKey && window.innerWidth > 768))) {
        e.preventDefault(); if (!isGenerating) send();
      }
    });
    inp.addEventListener('paste', async (e) => {
      const imgs = [...(e.clipboardData?.items||[])].filter(i => i.type.startsWith('image/'));
      if (!imgs.length) return;
      e.preventDefault();
      await AppDragDrop.processFiles(imgs.map(i => i.getAsFile()).filter(Boolean));
    });
  };

  const bindSendButton  = () => $('#send-btn')?.addEventListener('click', () => { if (!isGenerating) send(); });
  const bindStopButton  = () => $('#stop-btn')?.addEventListener('click', stopGeneration);
  const bindScrollButton= () => $('#scroll-btn')?.addEventListener('click', () => scrollToBottom(document.getElementById('messages')));
  const bindVoiceButton = () => $('#voice-btn')?.addEventListener('click', () => {
    AppVoice.toggleListening((t) => {
      const inp = $('#message-input');
      if (inp) { inp.value = (inp.value + ' ' + t).trim(); autoResize(inp); updateSendBtn(); }
    });
  });

  const autoResizeTextarea = () => autoResize($('#message-input'));
  const autoResize = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; };
  const updateSendBtn = () => {
    const inp = $('#message-input'); const btn = $('#send-btn');
    if (!btn || !inp) return;
    btn.disabled = !inp.value.trim() && !pendingFiles.length;
  };
  const updateStopBtn = (show) => {
    const s = $('#stop-btn'); const b = $('#send-btn');
    if (s) s.style.display = show ? 'flex' : 'none';
    if (b) b.style.display = show ? 'none' : 'flex';
  };

  const navigateChats = (dir) => {
    const chats = AppStorage.getAllChats().filter(c => !c.archived);
    if (!chats.length) return;
    const idx  = chats.findIndex(c => c.id === AppHistory.getCurrentId());
    const next = chats[AppUtils.clamp(idx + dir, 0, chats.length - 1)];
    if (next && next.id !== AppHistory.getCurrentId()) {
      const chat = AppHistory.load(next.id);
      if (chat) { currentChat = chat; renderChat(chat); AppSidebar.renderAll(); }
    }
  };

  return {
    init, newChat, send, stopGeneration,
    regenerate, continueGeneration,
    appendMessage, createMessageEl, renderChat,
    getCurrentChat: () => currentChat,
    isGenerating: () => isGenerating,
  };
})();
