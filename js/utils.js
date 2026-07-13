/* ============================================
   UMRANIGPT - Utilities
   ============================================ */
'use strict';

window.AppUtils = (() => {

  /* ---- ID Generation ---- */
  const generateId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  /* ---- Date Formatting ---- */
  const formatDate = (timestamp) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now - d;
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (secs < 60) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatDateTime = (timestamp) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  /* ---- String Helpers ---- */
  const truncate = (str, len = 50) => {
    if (!str) return '';
    return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
  };

  const escapeHtml = (str) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  };

  const stripHtml = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  const capitalise = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

  const slugify = (str) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---- Number Helpers ---- */
  const formatNumber = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  /* ---- Async Helpers ---- */
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const throttle = (fn, limit) => {
    let inThrottle;
    return (...args) => {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  };

  const retry = async (fn, attempts = 3, delay = 1000) => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === attempts - 1) throw err;
        await sleep(delay * (i + 1));
      }
    }
  };

  /* ---- DOM Helpers ---- */
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const createElement = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'data') Object.entries(v).forEach(([dk, dv]) => el.dataset[dk] = dv);
      else el.setAttribute(k, v);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    });
    return el;
  };

  const insertAfter = (newEl, refEl) => {
    refEl.parentNode.insertBefore(newEl, refEl.nextSibling);
  };

  const setHTML = (el, html) => {
    if (!el) return;
    el.innerHTML = html;
  };

  const setText = (el, text) => {
    if (!el) return;
    el.textContent = text;
  };

  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');
  const toggle = (el, force) => el && el.classList.toggle('hidden', force !== undefined ? !force : undefined);

  /* ---- Scroll ---- */
  const scrollToBottom = (el, smooth = true) => {
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  };

  const isScrolledToBottom = (el, threshold = 80) => {
    if (!el) return true;
    return el.scrollHeight - el.clientHeight - el.scrollTop <= threshold;
  };

  /* ---- Clipboard ---- */
  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      return true;
    } catch {
      return false;
    }
  };

  /* ---- File Helpers ---- */
  const getFileExtension = (name) => {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  };

  const getFileType = (name) => {
    const ext = getFileExtension(name);
    const cfg = window.AppConfig.SUPPORTED_FILES;
    if (cfg.image.includes(ext)) return 'image';
    if (cfg.text.includes(ext)) return 'text';
    if (cfg.document.includes(ext)) return 'document';
    if (cfg.archive && cfg.archive.includes(ext)) return 'archive';
    if (cfg.code.includes(ext)) return 'code';
    return 'unknown';
  };

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const readFileAsBase64 = async (file) => {
    const dataUrl = await readFileAsDataURL(file);
    return dataUrl.split(',')[1];
  };

  /* ---- JSON Helpers ---- */
  const safeJsonParse = (str, fallback = null) => {
    try { return JSON.parse(str); } catch { return fallback; }
  };

  const safeJsonStringify = (obj, indent = 0) => {
    try { return JSON.stringify(obj, null, indent); } catch { return '{}'; }
  };

  /* ---- URL Helpers ---- */
  const normaliseUrl = (url) => {
    if (!url) return '';
    url = url.trim().replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    return url;
  };

  const isValidUrl = (str) => {
    try { new URL(str); return true; } catch { return false; }
  };

  /* ---- Event Bus ---- */
  const _listeners = {};

  const on = (event, handler) => {
    if (!_listeners[event]) _listeners[event] = new Set();
    _listeners[event].add(handler);
    return () => off(event, handler);
  };

  const off = (event, handler) => {
    _listeners[event]?.delete(handler);
  };

  const emit = (event, data) => {
    _listeners[event]?.forEach(h => {
      try { h(data); } catch (e) { console.error('EventBus error:', e); }
    });
  };

  /* ---- Colour helpers ---- */
  const hexToRgba = (hex, alpha = 1) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  /* ---- Chat title extraction ---- */
  const extractChatTitle = (content) => {
    if (!content) return 'New Chat';
    const clean = stripHtml(content).trim();
    const firstLine = clean.split('\n')[0].trim();
    return truncate(firstLine || 'New Chat', 45);
  };

  /* ---- Token estimation (rough) ---- */
  const estimateTokens = (text) => {
    if (!text) return 0;
    return Math.ceil(text.split(/\s+/).length * 1.3);
  };

  /* ---- Download helper ---- */
  const downloadFile = (content, filename, type = 'text/plain') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---- Detect language (simple) ---- */
  const detectLanguage = (code) => {
    const patterns = [
      [/^(import|export|const|let|var|function|class|=>|async|await)\b/, 'javascript'],
      [/^(def |class |import |from |if __name__)/, 'python'],
      [/^(public |private |class |interface |namespace |using )/, 'csharp'],
      [/<\?php/, 'php'],
      [/^(package |import java|public class )/, 'java'],
      [/<html|<body|<div/, 'html'],
      [/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\b/i, 'sql'],
      [/^(#include|int main|void |printf)/, 'cpp'],
      [/^(func |package |import "fmt")/, 'go'],
      [/^(use strict|fn |struct |impl |let mut)/, 'rust'],
      [/^\s*[\[\{]/, 'json'],
      [/^---|\n---\n/, 'yaml'],
    ];
    for (const [re, lang] of patterns) {
      if (re.test(code.trim())) return lang;
    }
    return 'plaintext';
  };

  /* ---- Highlight search ---- */
  const highlightText = (text, query) => {
    if (!query) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(re, '<mark class="search-highlight">$1</mark>');
  };

  return {
    generateId, formatDate, formatTime, formatDateTime,
    truncate, escapeHtml, stripHtml, capitalise, slugify,
    formatNumber, formatBytes, clamp,
    sleep, debounce, throttle, retry,
    $, $$, createElement, insertAfter, setHTML, setText, show, hide, toggle,
    scrollToBottom, isScrolledToBottom,
    copyToClipboard,
    getFileExtension, getFileType, readFileAsText, readFileAsDataURL, readFileAsBase64,
    safeJsonParse, safeJsonStringify,
    normaliseUrl, isValidUrl,
    on, off, emit,
    hexToRgba,
    extractChatTitle, estimateTokens, downloadFile,
    detectLanguage, highlightText,
  };
})();
