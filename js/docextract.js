/* ============================================================
   UMRANIGPT — Document & OCR Extractor
   Real text extraction — no placeholders.

   PDF:   PDF.js → real text layer.
          If no text found (scanned PDF) → Tesseract.js OCR
          on each rendered page.
   DOCX:  mammoth.js → real Word text.
   ZIP:   JSZip → lists files, reads readable ones.
   Images: Tesseract.js OCR — English + Urdu + Arabic.

   All libraries: free/open-source, browser-based, zero cost.
============================================================ */
'use strict';

window.AppDocExtract = (() => {

  /* ---- Lazy script loader ---- */
  const _scripts = {};
  const loadScript = (url) => {
    if (_scripts[url]) return _scripts[url];
    _scripts[url] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload  = res;
      s.onerror = () => rej(new Error(`Script load failed: ${url}`));
      document.head.appendChild(s);
    });
    return _scripts[url];
  };

  /* ---- Show/hide OCR progress toast ---- */
  const showProgress = (msg) => {
    let el = document.getElementById('ocr-progress-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ocr-progress-toast';
      el.style.cssText = [
        'position:fixed','bottom:80px','right:20px','z-index:9999',
        'background:var(--surface-glass,var(--bg-secondary))',
        'border:1px solid var(--border-color,rgba(255,255,255,0.1))',
        'backdrop-filter:blur(16px)','padding:10px 16px',
        'border-radius:10px','font-size:0.82rem',
        'color:var(--text-primary)','box-shadow:0 4px 20px rgba(0,0,0,0.3)',
        'display:flex','align-items:center','gap:10px',
      ].join(';');
      document.body.appendChild(el);
    }
    el.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--accent-primary)"></i><span>${msg}</span>`;
    el.style.display = 'flex';
  };

  const hideProgress = () => {
    const el = document.getElementById('ocr-progress-toast');
    if (el) el.style.display = 'none';
  };

  /* ===========================================================
     OCR via Tesseract.js
     Supports: English, Urdu, Arabic, Roman Urdu (Latin script)
     CDN version runs entirely in the browser — no server.
  =========================================================== */
  const TESSERACT_CDN  = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
  const TESSERACT_LANGS = 'urd+ara+eng'; // Urdu + Arabic + English

  let _tesseractWorker = null;

  const getTesseractWorker = async () => {
    if (_tesseractWorker) return _tesseractWorker;

    showProgress('Loading OCR engine…');
    await loadScript(TESSERACT_CDN);
    if (!window.Tesseract) throw new Error('Tesseract.js did not load');

    showProgress('Loading language data (Urdu, Arabic, English)…');
    _tesseractWorker = await window.Tesseract.createWorker(TESSERACT_LANGS, 1, {
      workerPath:  'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/worker.min.js',
      langPath:    'https://tessdata.projectnaptha.com/4.0.0',
      corePath:    'https://cdn.jsdelivr.net/npm/tesseract.js-core@6/tesseract-core-simd.wasm.js',
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress) {
          showProgress(`OCR in progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    return _tesseractWorker;
  };

  const runOCR = async (imageSource) => {
    const worker = await getTesseractWorker();
    showProgress('Running OCR…');
    const { data: { text } } = await worker.recognize(imageSource);
    return (text || '').trim();
  };

  /* ===========================================================
     PDF.js — real text extraction
     Falls back to per-page OCR if no text layer found.
  =========================================================== */
  const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const loadPDFJS = async () => {
    if (!window.pdfjsLib) {
      await loadScript(PDFJS_CDN);
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      }
    }
    if (!window.pdfjsLib) throw new Error('PDF.js did not load');
    return window.pdfjsLib;
  };

  const extractPDF = async (file) => {
    showProgress('Loading PDF…');
    const pdfjs       = await loadPDFJS();
    const arrayBuffer = await file.arrayBuffer();
    const pdf         = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const totalPages  = pdf.numPages;
    const MAX_PAGES   = 50;
    const parts = [];
    let hasAnyText = false;

    /* --- Pass 1: Try the real text layer --- */
    showProgress(`Reading PDF text layer (${totalPages} pages)…`);
    for (let i = 1; i <= Math.min(totalPages, MAX_PAGES); i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text    = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        hasAnyText = true;
        parts.push(`--- Page ${i} ---\n${text}`);
      }
    }

    /* --- Pass 2: No text layer → OCR every page --- */
    if (!hasAnyText) {
      showProgress(`Scanned PDF detected — running OCR on ${Math.min(totalPages, MAX_PAGES)} pages…`);
      for (let i = 1; i <= Math.min(totalPages, MAX_PAGES); i++) {
        showProgress(`OCR: page ${i} / ${Math.min(totalPages, MAX_PAGES)}…`);
        const page     = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better OCR accuracy
        const canvas   = document.createElement('canvas');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const ocrText = await runOCR(canvas);
        if (ocrText) {
          hasAnyText = true;
          parts.push(`--- Page ${i} (OCR) ---\n${ocrText}`);
        }
        canvas.remove();
      }
    }

    hideProgress();
    return {
      text: hasAnyText
        ? parts.join('\n\n')
        : '[This PDF has no readable text and OCR found nothing. It may be corrupt or fully graphic.]',
      meta: `PDF · ${totalPages} page${totalPages !== 1 ? 's' : ''}${totalPages > MAX_PAGES ? ` (first ${MAX_PAGES} shown)` : ''}${!hasAnyText ? '' : (parts.some(p => p.includes('(OCR)')) ? ' · OCR used' : ' · text layer')}`,
    };
  };

  /* ===========================================================
     DOCX via mammoth.js
  =========================================================== */
  const MAMMOTH_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';

  const extractDOCX = async (file) => {
    showProgress('Loading Word document…');
    if (!window.mammoth) await loadScript(MAMMOTH_CDN);
    if (!window.mammoth) throw new Error('mammoth.js did not load');

    const arrayBuffer = await file.arrayBuffer();
    const result      = await window.mammoth.extractRawText({ arrayBuffer });
    hideProgress();

    const text = (result.value || '').trim();
    return {
      text: text || '[This Word document has no readable text]',
      meta: `Word document${result.messages?.length ? ` (${result.messages.length} note${result.messages.length !== 1 ? 's' : ''})` : ''}`,
    };
  };

  /* ===========================================================
     ZIP via JSZip
  =========================================================== */
  const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  const TEXT_EXTS = new Set([
    'txt','md','json','csv','xml','yaml','yml',
    'html','htm','js','ts','py','java','cs','go',
    'rs','sql','log','sh','php','rb','c','cpp','h',
  ]);

  const extractZIP = async (file) => {
    showProgress('Reading ZIP archive…');
    if (!window.JSZip) await loadScript(JSZIP_CDN);
    if (!window.JSZip) throw new Error('JSZip did not load');

    const arrayBuffer = await file.arrayBuffer();
    const zip         = await window.JSZip.loadAsync(arrayBuffer);
    const entries     = Object.keys(zip.files).filter(n => !zip.files[n].dir && !n.startsWith('__MACOSX/'));

    const textEntries = entries
      .filter(n => TEXT_EXTS.has(n.split('.').pop().toLowerCase()))
      .slice(0, 20);

    const parts = [
      `ZIP archive — ${entries.length} file${entries.length !== 1 ? 's' : ''}:`,
      entries.slice(0, 40).map(n => `  ${n}`).join('\n'),
      entries.length > 40 ? `  … and ${entries.length - 40} more` : '',
    ].filter(Boolean);

    if (textEntries.length) {
      parts.push('\n--- Readable file contents ---');
      for (const name of textEntries) {
        try {
          const content = await zip.files[name].async('string');
          const preview = content.slice(0, 4000);
          parts.push(`\n=== ${name} ===\n${preview}${content.length > 4000 ? '\n[truncated]' : ''}`);
        } catch { /* skip */ }
      }
    }

    hideProgress();
    return {
      text: parts.join('\n'),
      meta: `ZIP archive · ${entries.length} file${entries.length !== 1 ? 's' : ''}`,
    };
  };

  /* ===========================================================
     IMAGE OCR
     Runs Tesseract directly on the image file.
  =========================================================== */
  const extractImageOCR = async (file) => {
    showProgress('Running OCR on image…');
    try {
      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const text = await runOCR(dataUrl);
      hideProgress();
      return {
        text: text || '[No text found in image]',
        meta: `Image OCR · ${file.name}`,
        ocr: true,
      };
    } catch (err) {
      hideProgress();
      return {
        text: `[OCR failed: ${err.message}]`,
        meta: 'OCR error',
        ocr: true,
      };
    }
  };

  /* ===========================================================
     Public API — dispatch by file type
  =========================================================== */
  const extract = async (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'pdf')             return await extractPDF(file);
      if (ext === 'docx' || ext === 'doc') return await extractDOCX(file);
      if (ext === 'zip')             return await extractZIP(file);
      // Image types — OCR
      const IMG_EXTS = ['png','jpg','jpeg','gif','webp','bmp','tiff','tif'];
      if (IMG_EXTS.includes(ext))    return await extractImageOCR(file);
      return null;
    } catch (err) {
      hideProgress();
      console.error('[DocExtract]', file.name, err);
      return {
        text: `[Could not read ${file.name}: ${err.message}]`,
        meta: 'extraction error',
      };
    }
  };

  /* Expose OCR for images directly from the chat (called from dragdrop) */
  const ocrImage = async (imageSource) => {
    try { return await runOCR(imageSource); }
    catch (err) { hideProgress(); throw err; }
  };

  return { extract, ocrImage };
})();
