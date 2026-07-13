/* ============================================
   UMRANIGPT - Code Block Component
   ============================================ */
'use strict';

window.AppCodeblock = (() => {
  const { copyToClipboard, escapeHtml, detectLanguage } = window.AppUtils;
  const { getSettings } = window.AppStorage;

  /* ---- Create a code block element ---- */
  const create = (code, lang = '') => {
    const settings = getSettings();
    const resolvedLang = lang || detectLanguage(code);
    const displayLang = resolvedLang || 'code';

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    const id = window.AppUtils.generateId();
    wrapper.dataset.codeId = id;

    wrapper.innerHTML = `
      <div class="code-block-header">
        <span class="code-block-lang">${escapeHtml(displayLang)}</span>
        <div class="code-block-actions">
          <button class="code-block-btn" data-action="collapse" title="Collapse/Expand" aria-label="Toggle code visibility">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
          <button class="code-block-btn" data-action="copy" title="Copy code" aria-label="Copy to clipboard">
            <i class="fa-regular fa-copy"></i>
            <span>Copy</span>
          </button>
        </div>
      </div>
      <div class="code-block-content" id="code-content-${id}">
        <pre><code class="${resolvedLang ? `language-${resolvedLang}` : ''} hljs"></code></pre>
      </div>
    `;

    const codeEl = wrapper.querySelector('code');
    codeEl.textContent = code; // Safe text insertion

    // Apply syntax highlighting
    if (typeof hljs !== 'undefined') {
      try {
        if (resolvedLang && hljs.getLanguage(resolvedLang)) {
          const result = hljs.highlight(code, { language: resolvedLang });
          codeEl.innerHTML = result.value;
        } else {
          const result = hljs.highlightAuto(code, [
            'javascript', 'typescript', 'python', 'java', 'c', 'cpp',
            'csharp', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin',
            'html', 'css', 'json', 'yaml', 'xml', 'sql', 'bash', 'markdown'
          ]);
          codeEl.innerHTML = result.value;
          if (result.language && !lang) {
            wrapper.querySelector('.code-block-lang').textContent = result.language;
          }
        }
      } catch (err) {
        codeEl.textContent = code; // Fallback to plain text
      }
    }

    // Add line numbers if enabled
    if (settings.codeLineNumbers) {
      addLineNumbers(codeEl);
    }

    // Copy button
    const copyBtn = wrapper.querySelector('[data-action="copy"]');
    copyBtn.addEventListener('click', async () => {
      const success = await copyToClipboard(code);
      if (success) {
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i><span>Copy</span>';
        }, 2000);
      }
    });

    // Collapse button
    const collapseBtn = wrapper.querySelector('[data-action="collapse"]');
    const contentEl = wrapper.querySelector('.code-block-content');
    let collapsed = false;

    collapseBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      contentEl.classList.toggle('collapsed', collapsed);
      collapseBtn.innerHTML = collapsed
        ? '<i class="fa-solid fa-chevron-down"></i>'
        : '<i class="fa-solid fa-chevron-up"></i>';
      collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
    });

    // Auto-collapse very long code (> 80 lines)
    const lineCount = code.split('\n').length;
    if (lineCount > 80) {
      setTimeout(() => collapseBtn.click(), 50);
    }

    return wrapper;
  };

  /* ---- Add line numbers to code ---- */
  const addLineNumbers = (codeEl) => {
    const lines = codeEl.innerHTML.split('\n');
    const withNums = lines.map((line, i) => {
      const num = i + 1;
      return `<span class="code-line"><span class="code-line-num" aria-hidden="true">${num}</span><span class="code-line-content">${line}</span></span>`;
    });
    codeEl.innerHTML = withNums.join('\n');
    codeEl.classList.add('with-line-numbers');

    // Adjust pre padding
    const pre = codeEl.closest('pre');
    if (pre) pre.style.paddingLeft = '0';
  };

  /* ---- Apply theme to all code blocks ---- */
  const applyTheme = (isDark) => {
    const theme = isDark ? 'github-dark-dimmed' : 'github';
    // hljs theme is applied via CSS variables in variables.css
  };

  /* ---- Update line numbers setting ---- */
  const updateLineNumbers = (enabled) => {
    // Re-render would be needed; handled on next message
  };

  return { create, addLineNumbers, applyTheme, updateLineNumbers };
})();
