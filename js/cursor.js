/* ============================================================
   UMRANIGPT — Custom Dot & Ring Cursor Controller
   Uses RAF + spring physics for the ring lag effect.
   Zero external dependencies, ~3KB uncompressed.
============================================================ */
'use strict';

window.AppCursor = (() => {

  const HOVER_SELECTORS = [
    'a', 'button', '[role="button"]', 'label',
    'input[type="checkbox"]', 'input[type="radio"]',
    'input[type="range"]', 'select', '.btn-icon',
    '.sidebar-item', '.chat-bubble', '.model-card',
    '[data-action]', '.admin-nav-btn', '.admin-btn',
    '.settings-nav-item', '.theme-card', '[onclick]',
    '.copy-btn', '.reaction-btn', '.sidebar-footer-btn',
  ].join(',');

  const TEXT_SELECTORS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';

  let dotEl, ringEl;
  let mouseX = -200, mouseY = -200; // off-screen until first move
  let ringX  = -200, ringY  = -200;
  let rafId  = null;
  let enabled = false;

  /* Spring config for the ring's follow-lag */
  const SPRING_STIFFNESS = 0.14; // lower = more lag, higher = tighter

  /* Detect touch/coarse-pointer (mobile) — never enable there */
  const isTouchDevice = () =>
    window.matchMedia('(pointer: coarse)').matches ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0);

  const setClass = (name, on) => document.documentElement.classList.toggle(name, on);

  /* RAF loop — only the ring needs animation-frame smoothing;
     the dot is positioned via transform directly on mousemove */
  const loop = () => {
    // Spring: ring chases mouse position
    const dx = mouseX - ringX;
    const dy = mouseY - ringY;
    ringX += dx * SPRING_STIFFNESS;
    ringY += dy * SPRING_STIFFNESS;

    if (ringEl) ringEl.style.transform = `translate3d(${ringX}px,${ringY}px,0)`;
    rafId = requestAnimationFrame(loop);
  };

  /* Classify what element the cursor is over */
  const classify = (target) => {
    if (!target) return 'default';
    if (target.closest(TEXT_SELECTORS))  return 'text';
    if (target.closest(HOVER_SELECTORS)) return 'hover';
    return 'default';
  };

  const onMouseMove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (dotEl) dotEl.style.transform = `translate3d(${mouseX}px,${mouseY}px,0)`;

    // Make them visible after the first move
    if (dotEl && !dotEl.classList.contains('is-visible')) {
      dotEl.classList.add('is-visible');
      ringEl?.classList.add('is-visible');
    }

    const type = classify(e.target);
    setClass('cursor-hover', type === 'hover');
    setClass('cursor-text',  type === 'text');
    setClass('cursor-hidden', false);
  };

  const onMouseDown = () => setClass('cursor-click', true);
  const onMouseUp   = () => setClass('cursor-click', false);

  const onMouseLeave = () => setClass('cursor-hidden', true);
  const onMouseEnter = () => setClass('cursor-hidden', false);

  /* Settings persistence — users can toggle the cursor off */
  const STORAGE_KEY = 'umrani_cursor_enabled';
  const getStored   = () => {
    try { const v = localStorage.getItem(STORAGE_KEY); return v === null ? true : v === 'true'; }
    catch { return true; }
  };
  const setStored   = (on) => { try { localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false'); } catch {} };

  const enable = () => {
    if (isTouchDevice()) return; // never on touch
    enabled = true;
    document.documentElement.classList.add('has-custom-cursor');

    if (!dotEl) {
      dotEl  = document.getElementById('cursor-dot');
      ringEl = document.getElementById('cursor-ring');
    }
    if (!dotEl) return; // elements not in DOM yet

    document.addEventListener('mousemove',  onMouseMove,  { passive: true });
    document.addEventListener('mousedown',  onMouseDown,  { passive: true });
    document.addEventListener('mouseup',    onMouseUp,    { passive: true });
    document.addEventListener('mouseleave', onMouseLeave, { passive: true });
    document.addEventListener('mouseenter', onMouseEnter, { passive: true });

    if (!rafId) rafId = requestAnimationFrame(loop);
    setStored(true);
  };

  const disable = () => {
    enabled = false;
    document.documentElement.classList.remove('has-custom-cursor', 'cursor-hover', 'cursor-text', 'cursor-click', 'cursor-hidden');

    document.removeEventListener('mousemove',  onMouseMove);
    document.removeEventListener('mousedown',  onMouseDown);
    document.removeEventListener('mouseup',    onMouseUp);
    document.removeEventListener('mouseleave', onMouseLeave);
    document.removeEventListener('mouseenter', onMouseEnter);

    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (dotEl)  { dotEl.classList.remove('is-visible');  dotEl.style.transform = ''; }
    if (ringEl) { ringEl.classList.remove('is-visible'); ringEl.style.transform = ''; }
    setStored(false);
  };

  const toggle = () => { enabled ? disable() : enable(); return !enabled; };
  const isEnabled = () => enabled;

  const init = () => {
    if (isTouchDevice()) return;
    if (getStored()) enable();
  };

  return { init, enable, disable, toggle, isEnabled };
})();
