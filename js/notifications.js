/* ============================================
   UMRANIGPT - Notifications (Toast)
   ============================================ */
'use strict';

window.AppNotifications = (() => {
  let container;
  const { TOAST_DURATION } = window.AppConfig;

  const init = () => {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  };

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
  };

  const show = (type, title, message = '', duration = TOAST_DURATION) => {
    if (!container) init();

    const id = window.AppUtils.generateId();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = `toast-${id}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    toast.innerHTML = `
      <i class="toast-icon fa-solid ${icons[type] || icons.info}"></i>
      <div class="toast-body">
        <div class="toast-title">${window.AppUtils.escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${window.AppUtils.escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => remove(id));

    // Click to dismiss
    toast.addEventListener('click', (e) => {
      if (!e.target.closest('.toast-close')) remove(id);
    });

    container.appendChild(toast);

    // Start progress bar animation after paint
    requestAnimationFrame(() => {
      const progress = toast.querySelector('.toast-progress');
      if (progress) progress.classList.add('animating');
    });

    // Auto-remove
    const timer = setTimeout(() => remove(id), duration);
    toast._timer = timer;

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      clearTimeout(toast._timer);
      toast.querySelector('.toast-progress')?.style.setProperty('animation-play-state', 'paused');
    });

    toast.addEventListener('mouseleave', () => {
      toast._timer = setTimeout(() => remove(id), 1000);
      toast.querySelector('.toast-progress')?.style.setProperty('animation-play-state', 'running');
    });

    return id;
  };

  const remove = (id) => {
    const toast = document.getElementById(`toast-${id}`);
    if (!toast) return;
    clearTimeout(toast._timer);
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };

  const success = (title, msg, dur) => show('success', title, msg, dur);
  const error = (title, msg, dur) => show('error', title, msg, dur);
  const warning = (title, msg, dur) => show('warning', title, msg, dur);
  const info = (title, msg, dur) => show('info', title, msg, dur);

  const clearAll = () => {
    if (!container) return;
    [...container.children].forEach(t => t.remove());
  };

  return { init, show, remove, success, error, warning, info, clearAll };
})();
