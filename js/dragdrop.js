/* ============================================
   UMRANIGPT - Drag & Drop Module
   ============================================ */
'use strict';

window.AppDragDrop = (() => {
  let dragCounter = 0;
  let onFileCallback = null;
  const { getFileType, getFileExtension, formatBytes } = window.AppUtils;
  const MAX_SIZE_MB = window.AppConfig.MAX_FILE_SIZE_MB;
  const SUPPORTED = window.AppConfig.SUPPORTED_FILES;
  const allExts = Object.values(SUPPORTED).flat();

  /* ---- Init ---- */
  const init = (onFile) => {
    onFileCallback = onFile;

    // Global drag listeners
    document.addEventListener('dragenter', onDragEnter, false);
    document.addEventListener('dragleave', onDragLeave, false);
    document.addEventListener('dragover', onDragOver, false);
    document.addEventListener('drop', onDrop, false);

    // File input
    const fileInput = document.getElementById('file-input');
    const attachBtn = document.getElementById('attach-btn');

    if (fileInput) fileInput.addEventListener('change', onFileInputChange);
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput?.click());
  };

  /* ---- Drag events ---- */
  const onDragEnter = (e) => {
    e.preventDefault();
    dragCounter++;
    if (hasFiles(e)) showOverlay();
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      hideOverlay();
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e) => {
    e.preventDefault();
    dragCounter = 0;
    hideOverlay();

    const files = [...(e.dataTransfer?.files || [])];
    if (files.length > 0) processFiles(files);
  };

  /* ---- File input change ---- */
  const onFileInputChange = (e) => {
    const files = [...(e.target.files || [])];
    if (files.length > 0) processFiles(files);
    e.target.value = ''; // Reset so same file can be re-selected
  };

  /* ---- Process dropped files ---- */
  const processFiles = async (files) => {
    const processed = [];

    for (const file of files) {
      const ext    = getFileExtension(file.name);
      const type   = getFileType(file.name);
      const sizeMB = file.size / (1024 * 1024);

      // Validate extension
      if (!allExts.includes(ext)) {
        AppNotifications.warning('Unsupported file', `${file.name} — ${ext} files are not supported.`);
        continue;
      }

      // Validate size
      if (sizeMB > MAX_SIZE_MB) {
        AppNotifications.warning('File too large', `${file.name} exceeds ${MAX_SIZE_MB}MB limit.`);
        continue;
      }

      try {
        let content, dataUrl, base64, ocrText;

        if (type === 'image') {
          // Load image for vision model
          dataUrl = await AppUtils.readFileAsDataURL(file);
          base64  = dataUrl.split(',')[1];

          // Run OCR on the image — real text extraction via Tesseract.js
          if (window.AppDocExtract) {
            AppNotifications.info('OCR', `Reading text from ${file.name}…`);
            const ocrResult = await window.AppDocExtract.extract(file).catch(() => null);
            if (ocrResult?.text && ocrResult.text !== '[No text found in image]') {
              ocrText = ocrResult.text;
              AppNotifications.success('OCR done', `Text extracted from ${file.name}`);
            } else {
              AppNotifications.info('OCR', `No text found in image — sending as visual`);
            }
          }

          processed.push({
            file, type, name: file.name, size: file.size,
            dataUrl, base64,
            // Attach OCR text so AI can answer questions about it
            content: ocrText
              ? `[Image: ${file.name}]\n\nOCR extracted text:\n${ocrText}`
              : undefined,
            ocrText,
          });

        } else if (type === 'text' || type === 'code') {
          content = await AppUtils.readFileAsText(file);
          processed.push({ file, type, name: file.name, size: file.size, content });

        } else if (type === 'document' || type === 'archive') {
          // Real extraction: PDF text layer → fallback OCR, DOCX, ZIP
          if (window.AppDocExtract) {
            AppNotifications.info('Extracting', `Reading ${file.name}…`);
            const result = await window.AppDocExtract.extract(file).catch(err => ({
              text: `[Could not read file: ${err.message}]`,
              meta: file.name,
            }));
            content = `[${result.meta || file.name}]\n\n${result.text}`;
            AppNotifications.success('Done', `${file.name} — ${result.text.length.toLocaleString()} chars`);
          } else {
            // Fallback if docextract not loaded
            content = `[${file.name} — ${AppUtils.formatBytes(file.size)}]`;
          }
          processed.push({ file, type, name: file.name, size: file.size, content });

        } else {
          content = `[File: ${file.name}]`;
          processed.push({ file, type, name: file.name, size: file.size, content });
        }

      } catch (err) {
        console.error('[DragDrop]', err);
        AppNotifications.error('Read error', `Could not read ${file.name}: ${err.message}`);
      }
    }

    if (processed.length > 0) {
      onFileCallback?.(processed);
      renderPreviews(processed);
    }
  };

  /* ---- Render file previews above input ---- */
  const renderPreviews = (files) => {
    const container = document.getElementById('file-preview');
    if (!container) return;

    files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'file-preview-item';
      item.dataset.fileName = f.name;

      const iconMap = {
        image: 'fa-image',
        text: 'fa-file-lines',
        code: 'fa-code',
        document: 'fa-file-pdf',
        unknown: 'fa-file',
      };

      if (f.type === 'image' && f.dataUrl) {
        item.innerHTML = `
          <img class="file-preview-thumb" src="${f.dataUrl}" alt="${window.AppUtils.escapeHtml(f.name)}">
          <span class="file-preview-name">${window.AppUtils.escapeHtml(window.AppUtils.truncate(f.name, 20))}</span>
          <button class="file-preview-remove" aria-label="Remove file"><i class="fa-solid fa-xmark"></i></button>
        `;
      } else {
        item.innerHTML = `
          <i class="file-preview-icon fa-solid ${iconMap[f.type] || iconMap.unknown}"></i>
          <span class="file-preview-name">${window.AppUtils.escapeHtml(window.AppUtils.truncate(f.name, 20))}</span>
          <span style="font-size:10px;color:var(--text-muted);">${window.AppUtils.formatBytes(f.size)}</span>
          <button class="file-preview-remove" aria-label="Remove file"><i class="fa-solid fa-xmark"></i></button>
        `;
      }

      item.querySelector('.file-preview-remove').addEventListener('click', () => {
        item.remove();
        window.AppUtils.emit('fileRemoved', { name: f.name });
      });

      container.appendChild(item);
    });
  };

  const clearPreviews = () => {
    const container = document.getElementById('file-preview');
    if (container) container.innerHTML = '';
  };

  /* ---- Overlay ---- */
  const showOverlay = () => {
    document.getElementById('drag-overlay')?.classList.add('active');
  };

  const hideOverlay = () => {
    document.getElementById('drag-overlay')?.classList.remove('active');
  };

  const hasFiles = (e) => {
    return e.dataTransfer?.types?.includes('Files');
  };

  /* ---- Paste from clipboard ---- */
  const initPaste = (onFile) => {
    document.addEventListener('paste', async (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const imageItems = items.filter(item => item.type.startsWith('image/'));

      if (imageItems.length === 0) return;

      e.preventDefault();
      const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
      if (files.length > 0) {
        await processFiles(files);
        onFile?.(files);
      }
    });
  };

  return { init, initPaste, processFiles, renderPreviews, clearPreviews };
})();
