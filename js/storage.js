/* ============================================================
   UMRANIGPT — Storage Module
============================================================ */
'use strict';

window.AppStorage = (() => {
  const { STORAGE } = window.AppConfig;
  const { safeJsonParse, safeJsonStringify } = window.AppUtils;

  /* ---- Core ---- */
  const get    = (key, fb = null) => { try { const r = localStorage.getItem(key); if (r===null) return fb; return safeJsonParse(r, r); } catch { return fb; } };
  const set    = (key, val) => { try { localStorage.setItem(key, safeJsonStringify(val)); return true; } catch(e) { if(e.name==='QuotaExceededError'){purgeOldChats();try{localStorage.setItem(key,safeJsonStringify(val));return true;}catch{return false;}} return false; } };
  const remove = (key) => { try{localStorage.removeItem(key);return true;}catch{return false;} };

  /* ---- UI Settings (theme, font, voice, etc — NOT AI params) ---- */
  const getSettings = () => {
    const cfg = window.AppConfig;
    const defaults = {
      theme:          cfg.DEFAULT_THEME,
      fontSize:       cfg.DEFAULT_FONT_SIZE,
      animations:     cfg.DEFAULT_ANIMATIONS,
      showTimestamps: cfg.DEFAULT_TIMESTAMPS,
      codeLineNumbers:cfg.DEFAULT_LINE_NUMS,
      sidebarOpen:    cfg.DEFAULT_SIDEBAR,
      voiceSpeed:     cfg.DEFAULT_VOICE_SPEED,
      voicePitch:     cfg.DEFAULT_VOICE_PITCH,
      voiceVolume:    cfg.DEFAULT_VOICE_VOLUME,
      voiceName:      cfg.DEFAULT_VOICE_NAME,
      language:       cfg.DEFAULT_LANGUAGE,
      temperature:    cfg.AI.TEMPERATURE,
      userSystemPrompt: '',
      customCursor:   true,
    };
    return { ...defaults, ...get(STORAGE.SETTINGS, {}) };
  };
  const setSettings   = (s) => set(STORAGE.SETTINGS, s);
  const updateSetting = (key, val) => { const s = getSettings(); s[key] = val; return setSettings(s); };

  /* ---- AI params always come from AppConfig.AI (source code) ---- */
  const getAI = () => ({ ...window.AppConfig.AI });

  /* ---- Chats — with in-memory cache for performance ---- */
  let _chatsCache  = null; // null = stale / never loaded
  let _cacheVersion = 0;

  const _invalidateCache = () => { _chatsCache = null; };

  const getChats    = () => {
    if (_chatsCache !== null) return _chatsCache;
    const d = get(STORAGE.CHATS, {});
    _chatsCache = (typeof d === 'object' && !Array.isArray(d)) ? d : {};
    return _chatsCache;
  };
  const setChats    = (c) => { _chatsCache = c; _invalidateCache(); set(STORAGE.CHATS, c); _chatsCache = c; };
  const getChat     = (id) => getChats()[id] || null;
  const saveChat    = (chat) => {
    if (!chat?.id) return false;
    const c = getChats();
    c[chat.id] = { ...chat, updatedAt: Date.now() };
    _chatsCache = c;
    return set(STORAGE.CHATS, c);
  };
  const deleteChat  = (id) => { const c = getChats(); delete c[id]; _chatsCache = c; return set(STORAGE.CHATS, c); };
  const getAllChats  = () => Object.values(getChats()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const getCurrentChatId = () => get(STORAGE.CURRENT_CHAT, null);
  const setCurrentChatId = (id) => set(STORAGE.CURRENT_CHAT, id);

  /* ---- Folders ---- */
  const getFolders  = () => get(STORAGE.FOLDERS, []);
  const setFolders  = (f) => set(STORAGE.FOLDERS, f);
  const addFolder   = (name) => { const f=getFolders(); const folder={id:window.AppUtils.generateId(),name,chatIds:[],createdAt:Date.now()}; f.push(folder); setFolders(f); return folder; };
  const deleteFolder= (id) => setFolders(getFolders().filter(f=>f.id!==id));

  /* ---- Pinned ---- */
  const getPinned     = () => get(STORAGE.PINNED, []);
  const setPinned     = (ids) => set(STORAGE.PINNED, ids);
  const pinChat       = (id) => { const p=getPinned(); if(!p.includes(id)){p.unshift(id);setPinned(p);} };
  const unpinChat     = (id) => setPinned(getPinned().filter(p=>p!==id));
  const isChatPinned  = (id) => getPinned().includes(id);

  /* ---- Favourites ---- */
  const getFavourites    = () => get(STORAGE.FAVORITES, []);
  const setFavourites    = (ids) => set(STORAGE.FAVORITES, ids);
  const toggleFavourite  = (id) => { const f=getFavourites(); const i=f.indexOf(id); if(i===-1) f.unshift(id); else f.splice(i,1); setFavourites(f); return i===-1; };
  const isChatFavourite  = (id) => getFavourites().includes(id);

  /* ---- Purge ---- */
  const purgeOldChats = () => { const all=getAllChats(); const max=window.AppConfig.MAX_HISTORY_ITEMS; if(all.length>max){const r=getChats(); all.slice(max).forEach(c=>delete r[c.id]); setChats(r);} };

  /* ---- Export / Import ---- */
  const exportAllData = () => ({ version:window.AppConfig.VERSION, exportedAt:Date.now(), settings:getSettings(), chats:getAllChats(), folders:getFolders(), pinned:getPinned(), favourites:getFavourites() });
  const importData = (data) => {
    if(!data||typeof data!=='object') return false;
    try {
      if(data.settings) setSettings(data.settings);
      if(Array.isArray(data.chats)){const c={};data.chats.forEach(ch=>{if(ch?.id)c[ch.id]=ch;});setChats(c);}
      if(Array.isArray(data.folders))    setFolders(data.folders);
      if(Array.isArray(data.pinned))     setPinned(data.pinned);
      if(Array.isArray(data.favourites)) setFavourites(data.favourites);
      return true;
    } catch { return false; }
  };

  /* ---- Sidebar ---- */
  const getSidebarWidth = () => get(STORAGE.SIDEBAR_WIDTH, null);
  const setSidebarWidth = (w) => set(STORAGE.SIDEBAR_WIDTH, w);
  const getSidebarOpen  = () => get(STORAGE.SIDEBAR_OPEN, true);
  const setSidebarOpen  = (v) => set(STORAGE.SIDEBAR_OPEN, v);

  return {
    get, set, remove,
    getSettings, setSettings, updateSetting, getAI,
    getChats, setChats, getChat, saveChat, deleteChat, getAllChats,
    getCurrentChatId, setCurrentChatId,
    getFolders, setFolders, addFolder, deleteFolder,
    getPinned, setPinned, pinChat, unpinChat, isChatPinned,
    getFavourites, setFavourites, toggleFavourite, isChatFavourite,
    exportAllData, importData,
    getSidebarWidth, setSidebarWidth, getSidebarOpen, setSidebarOpen,
  };
})();
