/* ============================================
   UMRANIGPT - Markdown Renderer
   ============================================ */
'use strict';

window.AppMarkdown = (() => {
  let markedReady = false;

  const init = () => {
    if (typeof marked === 'undefined') {
      console.warn('marked.js not loaded');
      return;
    }

    marked.use({
      gfm: true,
      breaks: true,
      pedantic: false,
    });

    // Custom renderer
    const renderer = new marked.Renderer();

    // Code blocks - delegate to AppCodeblock
    renderer.code = (code, lang) => {
      return `<code-block-placeholder data-lang="${window.AppUtils.escapeHtml(lang || '')}" data-code="${encodeURIComponent(code)}"></code-block-placeholder>`;
    };

    // Inline code
    renderer.codespan = (code) => {
      return `<code>${window.AppUtils.escapeHtml(code)}</code>`;
    };

    // Links - open in new tab
    renderer.link = (href, title, text) => {
      const safe = window.AppUtils.escapeHtml(href || '');
      const t = title ? ` title="${window.AppUtils.escapeHtml(title)}"` : '';
      return `<a href="${safe}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    // Images
    renderer.image = (href, title, text) => {
      const safe = window.AppUtils.escapeHtml(href || '');
      const alt = window.AppUtils.escapeHtml(text || '');
      return `<img class="message-image" src="${safe}" alt="${alt}" loading="lazy" onclick="AppMarkdown.openLightbox('${safe}')">`;
    };

    // Tables with wrapper
    const originalTable = renderer.table.bind(renderer);
    renderer.table = (header, body) => {
      const table = originalTable(header, body);
      return `<div style="overflow-x:auto;">${table}</div>`;
    };

    marked.use({ renderer });
    markedReady = true;
  };

  /* ---- Render markdown to HTML ---- */
  const render = (text) => {
    if (!text) return '';

    try {
      // Pre-process: handle KaTeX math
      text = preprocessMath(text);

      let html;
      if (markedReady && typeof marked !== 'undefined') {
        html = marked.parse(text);
      } else {
        // Fallback: basic HTML-safe text
        html = `<p>${window.AppUtils.escapeHtml(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
      }

      // Sanitise
      if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote',
            'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img', 'div',
            'span', 'del', 's', 'sup', 'sub', 'code-block-placeholder',
          ],
          ALLOWED_ATTR: [
            'href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel',
            'data-lang', 'data-code', 'data-code-id', 'loading', 'onclick',
            'data-math', 'style',
          ],
          ALLOW_DATA_ATTR: true,
          FORCE_BODY: false,
        });
      }

      return html;
    } catch (err) {
      console.error('Markdown render error:', err);
      return `<p>${window.AppUtils.escapeHtml(text)}</p>`;
    }
  };

  /* ---- Process rendered HTML: replace placeholders with actual code blocks ---- */
  const processCodeBlocks = (container) => {
    const placeholders = container.querySelectorAll('code-block-placeholder');
    placeholders.forEach(ph => {
      const lang = ph.dataset.lang || '';
      const code = decodeURIComponent(ph.dataset.code || '');
      const blockEl = AppCodeblock.create(code, lang);
      ph.replaceWith(blockEl);
    });
  };

  /* ---- Process KaTeX math ---- */
  const processMath = (container) => {
    if (typeof katex === 'undefined') return;

    // Process display math [data-math="display"]
    container.querySelectorAll('[data-math="display"]').forEach(el => {
      const math = el.dataset.mathContent;
      try {
        katex.render(math, el, {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
      } catch (e) {
        el.textContent = math;
      }
    });

    // Process inline math [data-math="inline"]
    container.querySelectorAll('[data-math="inline"]').forEach(el => {
      const math = el.dataset.mathContent;
      try {
        katex.render(math, el, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
      } catch (e) {
        el.textContent = math;
      }
    });
  };

  /* ---- Pre-process text to mark math sections ---- */
  const preprocessMath = (text) => {
    if (typeof katex === 'undefined') return text;

    // Display math: $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      const encoded = encodeURIComponent(math.trim());
      return `<span data-math="display" data-math-content="${window.AppUtils.escapeHtml(math.trim())}"></span>`;
    });

    // Inline math: $...$ (avoid single $ in code)
    text = text.replace(/(?<![`$])\$([^$\n]+?)\$(?![`$])/g, (_, math) => {
      const encoded = encodeURIComponent(math.trim());
      return `<span data-math="inline" data-math-content="${window.AppUtils.escapeHtml(math.trim())}"></span>`;
    });

    return text;
  };

  /* ---- Full pipeline: render + process ---- */
  const renderInto = (container, text) => {
    if (!container) return;
    container.innerHTML = render(text);
    processCodeBlocks(container);
    processMath(container);
  };

  /* ---- Lightbox for images ---- */
  const openLightbox = (src) => {
    let lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.innerHTML = '<img alt="Full size image">';
      lb.addEventListener('click', () => lb.classList.remove('visible'));
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = src;
    lb.classList.add('visible');
  };

  /* ---- Streaming: append partial text ---- */
  const appendChunk = (container, chunk) => {
    if (!container) return;
    // For streaming, we accumulate and re-render
    // This is handled by chat.js which stores the full text and calls renderInto
  };

  /* ---- Plain text extraction ---- */
  const toPlainText = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  return { init, render, renderInto, processCodeBlocks, processMath, openLightbox, toPlainText };
})();
