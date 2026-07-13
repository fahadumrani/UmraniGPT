/* ============================================
   UMRANIGPT - Security Module
   ============================================ */
'use strict';

window.AppSecurity = (() => {
  /* ---- Sanitise HTML (wraps DOMPurify) ---- */
  const sanitise = (dirty, extraTags = [], extraAttrs = []) => {
    if (typeof DOMPurify === 'undefined') {
      return document.createElement('div').appendChild(document.createTextNode(dirty)).textContent;
    }

    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img', 'div',
        'span', 'del', 's', 'sup', 'sub', 'mark', 'small', 'kbd',
        ...extraTags,
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel',
        'data-lang', 'data-code', 'data-code-id', 'loading', 'onclick',
        'data-math', 'data-math-content', 'style', 'aria-label', 'role',
        ...extraAttrs,
      ],
      ALLOW_DATA_ATTR: true,
      ADD_TAGS: ['code-block-placeholder'],
      ADD_ATTR: ['data-lang', 'data-code'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onmouseover', 'onfocus'],
      FORCE_BODY: false,
      WHOLE_DOCUMENT: false,
    });
  };

  /* ---- Validate Ollama URL ---- */
  const validateOllamaUrl = (url) => {
    if (!url) return { valid: false, error: 'URL is required' };

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'URL must use http or https' };
      }
      if (!parsed.hostname) {
        return { valid: false, error: 'Invalid hostname' };
      }
      return { valid: true, url: parsed.toString().replace(/\/+$/, '') };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  };

  /* ---- Rate limiting (client-side) ---- */
  const _rateLimits = {};

  const checkRateLimit = (key, maxRequests = 10, windowMs = 60000) => {
    const now = Date.now();
    if (!_rateLimits[key]) _rateLimits[key] = [];

    // Remove expired entries
    _rateLimits[key] = _rateLimits[key].filter(t => now - t < windowMs);

    if (_rateLimits[key].length >= maxRequests) {
      return { allowed: false, remaining: 0, resetIn: windowMs - (now - _rateLimits[key][0]) };
    }

    _rateLimits[key].push(now);
    return { allowed: true, remaining: maxRequests - _rateLimits[key].length };
  };

  /* ---- Content Security ---- */
  const isSafeUrl = (url) => {
    try {
      const parsed = new URL(url);
      // Block javascript: and data: URLs in links
      if (['javascript:', 'data:', 'vbscript:'].includes(parsed.protocol)) return false;
      return true;
    } catch {
      return false;
    }
  };

  const sanitiseFilename = (name) => {
    return name.replace(/[^a-zA-Z0-9._\-\s]/g, '_').trim();
  };

  /* ---- Init DOMPurify hooks ---- */
  const init = () => {
    if (typeof DOMPurify === 'undefined') return;

    // Add a hook to sanitise links
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (!isSafeUrl(href)) node.removeAttribute('href');
        node.setAttribute('rel', 'noopener noreferrer');
        node.setAttribute('target', '_blank');
      }
    });
  };

  return { sanitise, validateOllamaUrl, checkRateLimit, isSafeUrl, sanitiseFilename, init };
})();
