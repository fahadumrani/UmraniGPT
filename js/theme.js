/* ============================================
   UMRANIGPT - Theme Manager
   ============================================ */
'use strict';

window.AppTheme = (() => {
  const { THEMES, DEFAULT_THEME } = window.AppConfig;
  const { updateSetting, getSettings } = window.AppStorage;
  const { emit } = window.AppUtils;

  let currentTheme = DEFAULT_THEME;

  const themeNames = {
    dark: 'Dark', light: 'Light', oled: 'OLED',
    cyber: 'Cyber', blue: 'Ocean', purple: 'Purple',
    green: 'Forest', glass: 'Glass',
  };

  /* Theme preview colors */
  const themeColors = {
    dark:   { bg: '#0d0d13', surface: '#1e1e2e', accent: '#8b5cf6', msg: '#7c3aed' },
    light:  { bg: '#f5f5fa', surface: '#ffffff', accent: '#7c3aed', msg: '#7c3aed' },
    oled:   { bg: '#000000', surface: '#121212', accent: '#8b5cf6', msg: '#6d28d9' },
    cyber:  { bg: '#020a12', surface: '#0d2038', accent: '#00ffff', msg: '#0066cc' },
    blue:   { bg: '#050c1a', surface: '#162b52', accent: '#60a5fa', msg: '#2563eb' },
    purple: { bg: '#08051a', surface: '#221e52', accent: '#a855f7', msg: '#7e22ce' },
    green:  { bg: '#021208', surface: '#103828', accent: '#34d399', msg: '#059669' },
    glass:  { bg: '#1a1035', surface: 'rgba(255,255,255,0.06)', accent: '#c084fc', msg: '#a855f7' },
  };

  const init = () => {
    const settings = getSettings();
    currentTheme = settings.theme || DEFAULT_THEME;
    apply(currentTheme, false);

    // Listen for OS dark mode changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === 'system') apply('system', false);
    });
  };

  const apply = (theme, save = true) => {
    if (!THEMES.includes(theme) && theme !== 'system') theme = DEFAULT_THEME;

    let resolvedTheme = theme;
    if (theme === 'system') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme);
    currentTheme = theme;
    if (save) updateSetting('theme', theme);

    // Update theme-color meta tag
    const colors = themeColors[resolvedTheme] || themeColors.dark;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = colors.bg;

    emit('themeChanged', { theme, resolvedTheme });
    return resolvedTheme;
  };

  const get = () => currentTheme;

  const getResolved = () => {
    if (currentTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return currentTheme;
  };

  const cycle = () => {
    const idx = THEMES.indexOf(currentTheme);
    const next = THEMES[(idx + 1) % THEMES.length];
    apply(next);
    return next;
  };

  const getThemeName = (t) => themeNames[t] || window.AppUtils.capitalise(t);
  const getThemeColors = (t) => themeColors[t] || themeColors.dark;

  const isDark = () => {
    const resolved = getResolved();
    return ['dark', 'oled', 'cyber', 'blue', 'purple', 'green', 'glass'].includes(resolved);
  };

  /* Render theme previews in settings */
  const renderThemePreviews = (container) => {
    if (!container) return;
    container.innerHTML = '';

    THEMES.forEach((theme, i) => {
      const colors = themeColors[theme];
      const isSelected = theme === currentTheme;

      const item = document.createElement('div');
      item.className = `theme-option ${isSelected ? 'selected' : ''}`;
      item.dataset.theme = theme;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `${getThemeName(theme)} theme`);
      item.setAttribute('tabindex', '0');
      item.style.setProperty('animation-delay', `${i * 50}ms`);

      const bgColor = colors.bg.startsWith('linear') ? '#1a1035' : colors.bg;
      const surfaceColor = colors.surface.startsWith('rgba') ? 'rgba(255,255,255,0.1)' : colors.surface;

      item.innerHTML = `
        <div class="theme-preview" style="background: ${bgColor};">
          <div class="theme-preview-inner">
            <div class="theme-preview-bar" style="background: ${colors.accent}; opacity: 0.8;"></div>
            <div class="theme-preview-msg1" style="background: ${surfaceColor};"></div>
            <div class="theme-preview-msg2" style="background: ${colors.msg};"></div>
          </div>
          ${isSelected ? '<div style="position:absolute;top:4px;right:4px;width:16px;height:16px;background:'+colors.accent+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;color:white;">✓</div>' : ''}
        </div>
        <span class="theme-label">${getThemeName(theme)}</span>
      `;

      item.addEventListener('click', () => {
        apply(theme);
        container.querySelectorAll('.theme-option').forEach(el => {
          el.classList.toggle('selected', el.dataset.theme === theme);
        });
        AppNotifications.info(`Theme: ${getThemeName(theme)}`);
      });

      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });

      container.appendChild(item);
    });
  };

  return { init, apply, get, getResolved, cycle, getThemeName, getThemeColors, isDark, renderThemePreviews };
})();
