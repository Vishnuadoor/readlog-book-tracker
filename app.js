/**
 * READLOG — Personal Reading Shelf
 * Enterprise-grade client-side application with IndexedDB persistence,
 * cover thumbnail processing, strict magic-byte validation, and backup export/import.
 */

(function () {
  'use strict';

  // --- Constants & Validation Limits ---
  const DB_NAME = 'readlog_db';
  const DB_VERSION = 1;
  const STORE_BOOKS = 'books';
  const LEGACY_STORAGE_KEY = 'bookTrackerBooks';

  const ALLOWED_STATUSES = Object.freeze(['to-read', 'reading', 'finished']);
  const DEFAULT_STATUS = 'to-read';

  const MAX_TITLE_LENGTH = 150;
  const MAX_AUTHOR_LENGTH = 100;
  const MAX_BOOKS_LIMIT = 10000;

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
  const MAX_IMAGE_DIMENSION = 10000; // 10,000 px
  const MAX_IMAGE_PIXELS = 50 * 1000 * 1000; // 50 Megapixels
  const MAX_CANVAS_SIDE = 1200; // 1200 px max dimension for covers
  const BACKUP_MAX_BYTES = 100 * 1024 * 1024; // 100 MB (104,857,600 bytes)

  // Regex to ensure text has at least one alphanumeric or word character (rejects whitespace or symbols-only)
  const ALPHANUMERIC_REGEX = /[a-zA-Z0-9\p{L}\p{N}]/u;

  // --- Application State ---
  let db = null;
  let inMemoryFallback = false;
  let books = [];
  let searchQuery = '';

  // Form State for Cover Thumbnail
  let currentThumbnailBlob = null;
  let currentPreviewUrl = null;

  // Custom Select Dropdown Controllers
  let addCustomSelect = null;
  let editCustomSelect = null;

  // Edit Modal State
  let editingBookId = null;
  let editThumbnailBlob = null;
  let editPreviewUrl = null;
  let editRemoveCoverFlag = false;

  // Delete Modal State
  let pendingDeleteId = null;
  let pendingBulkDeleteIds = null;
  let lastActiveElementBeforeModal = null;

  // Backup Import State
  let pendingImportPayload = null;

  // Bulk Selection State
  const selectedBooks = new Set();

  // Object URL Tracking for Safe Revocation
  const activeObjectUrls = new Set();

  function trackObjectUrl(url) {
    if (url && typeof url === 'string') {
      activeObjectUrls.add(url);
    }
    return url;
  }

  function revokeTrackedUrl(url) {
    if (url && activeObjectUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
      activeObjectUrls.delete(url);
    }
  }

  function revokeAllTrackedUrls() {
    activeObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    });
    activeObjectUrls.clear();
  }

  window.addEventListener('beforeunload', revokeAllTrackedUrls);

  // --- DOM Element References ---
  const dom = {
    // Stats & Progress Elements
    statTotal: document.getElementById('stat-total'),
    statToRead: document.getElementById('stat-to-read'),
    statReading: document.getElementById('stat-reading'),
    statFinished: document.getElementById('stat-finished'),
    progressPercentageNum: document.getElementById('progress-percentage-num'),
    progressRatioText: document.getElementById('progress-ratio-text'),
    progressStatusSummary: document.getElementById('progress-status-summary'),
    progressChipReading: document.getElementById('progress-chip-reading'),
    progressChipToread: document.getElementById('progress-chip-toread'),
    progressBarFillFinished: document.getElementById('progress-bar-fill-finished'),
    progressBarFillReading: document.getElementById('progress-bar-fill-reading'),
    progressBarFillToread: document.getElementById('progress-bar-fill-toread'),
    shelfMomentumMsg: document.getElementById('shelf-momentum-msg'),

    // Storage Alert
    storageAlert: document.getElementById('storage-alert'),
    storageAlertTitle: document.getElementById('storage-alert-title'),
    storageAlertText: document.getElementById('storage-alert-text'),
    storageAlertDismiss: document.getElementById('storage-alert-dismiss'),

    // Add Book Form
    addBookForm: document.getElementById('add-book-form'),
    bookTitleInput: document.getElementById('book-title'),
    bookAuthorInput: document.getElementById('book-author'),
    bookStatusSelect: document.getElementById('book-status'),
    customStatusTrigger: document.getElementById('custom-status-trigger'),
    customStatusCurrent: document.getElementById('custom-status-current'),
    customStatusDropdown: document.getElementById('custom-status-dropdown'),
    titleCharCount: document.getElementById('title-char-count'),
    authorCharCount: document.getElementById('author-char-count'),
    titleError: document.getElementById('title-error'),
    authorError: document.getElementById('author-error'),
    formGeneralError: document.getElementById('form-general-error'),
    addBookBtn: document.getElementById('add-book-btn'),
    addBookBtnText: document.getElementById('add-book-btn-text'),

    // Thumbnail Dropzone & Preview System
    thumbnailDropzone: document.getElementById('thumbnail-dropzone'),
    bookThumbnailInput: document.getElementById('book-thumbnail-input'),
    dropzonePrompt: document.getElementById('dropzone-prompt'),
    dropzoneDragoverPrompt: document.getElementById('dropzone-dragover-prompt'),
    thumbnailLoading: document.getElementById('thumbnail-loading'),
    thumbnailPreviewCard: document.getElementById('thumbnail-preview-card'),
    thumbnailPreviewImg: document.getElementById('thumbnail-preview-img'),
    previewFilename: document.getElementById('preview-filename'),
    previewBadgeReady: document.getElementById('preview-badge-ready'),
    previewFormat: document.getElementById('preview-format'),
    previewFilesize: document.getElementById('preview-filesize'),
    previewDimensions: document.getElementById('preview-dimensions'),
    changeThumbnailBtn: document.getElementById('change-thumbnail-btn'),
    removeThumbnailBtn: document.getElementById('remove-thumbnail-btn'),
    thumbnailError: document.getElementById('thumbnail-error'),
    thumbnailNotice: document.getElementById('thumbnail-notice'),
    thumbnailSrStatus: document.getElementById('thumbnail-sr-status'),

    // Shelf & Search
    shelfCountBadge: document.getElementById('shelf-count-badge'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    resetSearchBtn: document.getElementById('reset-search-btn'),
    bookGrid: document.getElementById('book-grid'),
    emptyShelfState: document.getElementById('empty-shelf-state'),
    noResultsState: document.getElementById('no-results-state'),
    noResultsQuery: document.getElementById('no-results-query'),

    // Header Backup Actions
    exportBackupBtn: document.getElementById('export-backup-btn'),
    importBackupBtn: document.getElementById('import-backup-btn'),
    backupFileInput: document.getElementById('backup-file-input'),

    // Delete Modal
    deleteModal: document.getElementById('delete-modal'),
    deleteModalTitle: document.getElementById('delete-modal-title'),
    deleteModalDesc: document.getElementById('delete-modal-desc'),
    deleteBookName: document.getElementById('delete-book-name'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
    cancelDeleteX: document.getElementById('cancel-delete-x'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),

    // Edit Modal
    editModal: document.getElementById('edit-modal'),
    editBookForm: document.getElementById('edit-book-form'),
    editBookTitle: document.getElementById('edit-book-title'),
    editBookAuthor: document.getElementById('edit-book-author'),
    editBookStatus: document.getElementById('edit-book-status'),
    editCustomStatusTrigger: document.getElementById('edit-custom-status-trigger'),
    editCustomStatusCurrent: document.getElementById('edit-custom-status-current'),
    editCustomStatusDropdown: document.getElementById('edit-custom-status-dropdown'),
    editTitleCharCount: document.getElementById('edit-title-char-count'),
    editAuthorCharCount: document.getElementById('edit-author-char-count'),
    editTitleError: document.getElementById('edit-title-error'),
    editAuthorError: document.getElementById('edit-author-error'),
    editGeneralError: document.getElementById('edit-general-error'),
    cancelEditX: document.getElementById('cancel-edit-x'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    editThumbPreviewBox: document.getElementById('edit-thumb-preview-box'),
    editThumbPreviewImg: document.getElementById('edit-thumb-preview-img'),
    editThumbPlaceholder: document.getElementById('edit-thumb-placeholder'),
    editChangeThumbBtn: document.getElementById('edit-change-thumb-btn'),
    editRemoveThumbBtn: document.getElementById('edit-remove-thumb-btn'),
    editThumbnailInput: document.getElementById('edit-thumbnail-input'),
    editThumbnailError: document.getElementById('edit-thumbnail-error'),

    // Import Modal
    importModal: document.getElementById('import-modal'),
    importBooksCount: document.getElementById('import-books-count'),
    cancelImportX: document.getElementById('cancel-import-x'),
    cancelImportBtn: document.getElementById('cancel-import-btn'),
    importMergeBtn: document.getElementById('import-merge-btn'),
    importReplaceBtn: document.getElementById('import-replace-btn'),

    // Import Progress Modal
    importProgressModal: document.getElementById('import-progress-modal'),
    importProgressIconBox: document.getElementById('import-progress-icon-box'),
    importProgressSpinnerIcon: document.getElementById('import-progress-spinner-icon'),
    importProgressSuccessIcon: document.getElementById('import-progress-success-icon'),
    importProgressTitle: document.getElementById('import-progress-title'),
    importProgressSubtitle: document.getElementById('import-progress-subtitle'),
    importTimerBadge: document.getElementById('import-timer-badge'),
    importRunningTime: document.getElementById('import-running-time'),
    importStatusText: document.getElementById('import-status-text'),
    importPercentText: document.getElementById('import-percent-text'),
    importProgressbar: document.getElementById('import-progressbar'),
    importProgressFill: document.getElementById('import-progress-fill'),
    importStatCompleted: document.getElementById('import-stat-completed'),
    importStatCompletedSub: document.getElementById('import-stat-completed-sub'),
    importStatRemaining: document.getElementById('import-stat-remaining'),
    importStatRemainingSub: document.getElementById('import-stat-remaining-sub'),
    importStatEta: document.getElementById('import-stat-eta'),
    importStatEtaSub: document.getElementById('import-stat-eta-sub'),
    importCurrentItemBox: document.getElementById('import-current-item-box'),
    importCurrentTitle: document.getElementById('import-current-title'),
    importCompleteSummary: document.getElementById('import-complete-summary'),
    importSummaryImported: document.getElementById('import-summary-imported'),
    importSummarySkipped: document.getElementById('import-summary-skipped'),
    importSummaryTime: document.getElementById('import-summary-time'),
    importProgressDoneBtn: document.getElementById('import-progress-done-btn'),

    // Toast Container
    toastContainer: document.getElementById('toast-container'),

    // Bulk Selection
    bulkActionBar: document.getElementById('bulk-action-bar'),
    bulkCountLabel: document.getElementById('bulk-count-label'),
    selectAllCheckbox: document.getElementById('select-all-checkbox'),
    bulkDeselectBtn: document.getElementById('bulk-deselect-btn'),
    bulkDeleteBtn: document.getElementById('bulk-delete-btn')
  };

  // --- Helper: Clean Text Normalization ---
  function normalizeText(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/\s+/g, ' ');
  }

  // --- Helper: Safe HTML Escaping ---
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Helper: Human-Readable File Size ---
  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- Helper: Stable Unique ID ---
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch (e) {}
    }
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `book-${timestamp}-${randomPart}`;
  }

  // --- Stacked Card Deck Toast Notifications (Sonner / Apple-style Stack) ---
  const activeToastStack = [];

  function updateToastStack() {
    if (!dom.toastContainer) return;

    activeToastStack.forEach((toastItem, idx) => {
      const el = toastItem.element;
      el.dataset.toastDepth = idx;
      el.style.zIndex = String(100 - idx * 10);

      if (idx === 0) {
        // Front / newest toast
        el.style.transform = 'translate3d(0, 0, 0) scale(1)';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      } else if (idx === 1) {
        // First background card layer behind front
        el.style.transform = 'translate3d(0, -14px, 0) scale(0.95)';
        el.style.opacity = '0.9';
        el.style.pointerEvents = 'none';
      } else if (idx === 2) {
        // Second background card layer behind front
        el.style.transform = 'translate3d(0, -28px, 0) scale(0.90)';
        el.style.opacity = '0.72';
        el.style.pointerEvents = 'none';
      } else {
        // Older cards fade out
        el.style.transform = 'translate3d(0, -42px, 0) scale(0.85)';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    });

    // Prune very old toasts beyond 4
    while (activeToastStack.length > 4) {
      const oldest = activeToastStack.pop();
      if (oldest && oldest.element && oldest.element.parentNode) {
        oldest.element.remove();
      }
      if (oldest && oldest.timer) {
        clearTimeout(oldest.timer);
      }
    }
  }

  function dismissToast(toastItem) {
    const el = toastItem.element;
    if (!el || !el.parentNode) return;

    // Slide down and fade away smoothly
    el.style.transform = 'translate3d(0, 18px, 0) scale(0.96)';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';

    if (toastItem.timer) {
      clearTimeout(toastItem.timer);
    }

    const index = activeToastStack.indexOf(toastItem);
    if (index !== -1) {
      activeToastStack.splice(index, 1);
    }

    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 280);

    // Refresh remaining stack cards to glide forward
    updateToastStack();
  }

  function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    // Leading icon badge based on type
    const iconWrap = document.createElement('div');
    iconWrap.className = 'toast-icon-badge';
    iconWrap.setAttribute('aria-hidden', 'true');

    if (type === 'success') {
      iconWrap.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else if (type === 'error') {
      iconWrap.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      `;
    } else {
      iconWrap.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      `;
    }
    toast.appendChild(iconWrap);

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-msg-text';
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-alert-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.innerHTML = '&times;';

    const toastItem = { element: toast, timer: null };

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast(toastItem);
    });
    toast.appendChild(closeBtn);

    // Initial appearance state (entering from bottom)
    toast.style.transform = 'translate3d(0, 20px, 0) scale(0.96)';
    toast.style.opacity = '0';

    dom.toastContainer.appendChild(toast);
    activeToastStack.unshift(toastItem);

    // Trigger stack reflow with smooth transition
    requestAnimationFrame(() => {
      updateToastStack();
    });

    // Auto dismiss after 4.5 seconds
    toastItem.timer = setTimeout(() => {
      dismissToast(toastItem);
    }, 4500);
  }

  // --- Storage Alert ---
  function showStorageAlert(title, message) {
    if (!dom.storageAlert) return;
    dom.storageAlertTitle.textContent = title + ':';
    dom.storageAlertText.textContent = ' ' + message;
    dom.storageAlert.hidden = false;
  }

  function hideStorageAlert() {
    if (dom.storageAlert) {
      dom.storageAlert.hidden = true;
    }
  }

  // --- Database Initialization (IndexedDB with idb) ---
  async function initDatabase() {
    if (typeof idb === 'undefined' || !window.indexedDB) {
      console.warn('[READLOG] IndexedDB or idb library not available. Operating in in-memory mode.');
      inMemoryFallback = true;
      showStorageAlert(
        'IndexedDB Unavailable',
        'Your browser is blocking IndexedDB (e.g. strict private mode). Books will persist in memory for this session only.'
      );
      books = [];
      return;
    }

    try {
      db = await idb.openDB(DB_NAME, DB_VERSION, {
        upgrade(upgradeDb) {
          if (!upgradeDb.objectStoreNames.contains(STORE_BOOKS)) {
            upgradeDb.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
          }
        }
      });

      // Request persistent storage if supported
      if (navigator.storage && navigator.storage.persist) {
        try {
          await navigator.storage.persist();
        } catch (e) {}
      }

      // Check quota and estimate
      await checkStorageEstimate();

      // Load books from IndexedDB
      const loaded = await db.getAll(STORE_BOOKS);
      if (Array.isArray(loaded) && loaded.length > 0) {
        books = loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      } else {
        // Attempt clean legacy localStorage migration
        await migrateLegacyLocalStorage();
      }
    } catch (err) {
      console.error('[READLOG] Database open error:', err);
      inMemoryFallback = true;
      showStorageAlert(
        'Database Error',
        'Could not initialize local IndexedDB. Operating in temporary session mode.'
      );
      books = [];
    }
  }

  // --- Storage Quota Estimation ---
  async function checkStorageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota && estimate.usage) {
        const percentage = (estimate.usage / estimate.quota) * 100;
        if (percentage >= 95) {
          showStorageAlert(
            'Storage Critical (Over 95%)',
            'Storage is nearly full. New book covers are blocked until older books or covers are deleted.'
          );
        } else if (percentage >= 80) {
          showStorageAlert(
            'Storage Warning (Over 80%)',
            'Your browser storage is over 80% full. Consider exporting a backup to prevent data loss.'
          );
        }
      }
    } catch (e) {}
  }

  // --- Migration: Legacy LocalStorage to IndexedDB ---
  async function migrateLegacyLocalStorage() {
    try {
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated = [];
        for (const item of parsed) {
          if (item && item.title && item.author) {
            let status = 'to-read';
            if (item.status === 'Reading' || item.status === 'reading') status = 'reading';
            else if (item.status === 'Finished' || item.status === 'finished') status = 'finished';

            migrated.push({
              id: item.id || generateId(),
              title: normalizeText(item.title),
              author: normalizeText(item.author),
              status,
              createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
              thumbnailBlob: null
            });
          }
        }

        if (migrated.length > 0 && db) {
          const tx = db.transaction(STORE_BOOKS, 'readwrite');
          for (const book of migrated) {
            await tx.store.put(book);
          }
          await tx.done;
          books = migrated;
          showToast(`Migrated ${migrated.length} books from previous storage.`, 'info');
        }
      }
    } catch (e) {
      console.warn('[READLOG] Legacy migration notice:', e);
    }
  }

  // --- Database Persistence Operations ---
  async function saveBookToDb(book) {
    if (inMemoryFallback || !db) return true;
    try {
      await db.put(STORE_BOOKS, book);
      await checkStorageEstimate();
      return true;
    } catch (err) {
      console.error('[READLOG] Failed to save book:', err);
      if (err.name === 'QuotaExceededError') {
        showToast('Storage is full. Delete some books or use smaller images.', 'error');
      } else {
        showToast('Failed to save changes to local database.', 'error');
      }
      return false;
    }
  }

  async function deleteBookFromDb(id) {
    if (inMemoryFallback || !db) return true;
    try {
      await db.delete(STORE_BOOKS, id);
      await checkStorageEstimate();
      return true;
    } catch (err) {
      console.error('[READLOG] Failed to delete book from db:', err);
      return false;
    }
  }

  // --- File Signature & Magic-Byte Detection ---
  async function detectImageSignature(file) {
    try {
      // Read the first 512 bytes
      const slice = file.slice(0, 512);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.length < 2) return null;

      // JPEG: FF D8 FF
      if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'image/jpeg';
      }

      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
      ) {
        return 'image/png';
      }

      // GIF: GIF87a or GIF89a
      if (
        bytes.length >= 6 &&
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
      ) {
        return 'image/gif';
      }

      // WEBP: RIFF....WEBP
      if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
      ) {
        return 'image/webp';
      }

      // BMP: BM (42 4D)
      if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4D) {
        return 'image/bmp';
      }

      // TIFF: 49 49 2A 00 or 4D 4D 00 2A
      if (
        bytes.length >= 4 &&
        ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
         (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A))
      ) {
        return 'image/tiff';
      }

      // AVIF / HEIC container check: ftyp box at bytes 4-7
      if (
        bytes.length >= 12 &&
        bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
      ) {
        const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
        if (brand === 'avif' || brand === 'avis') {
          return 'image/avif';
        }
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
          return 'image/heic';
        }
      }

      // SVG: starts with <svg or <?xml (after trimming whitespace/BOM) and contains <svg
      const headerText = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
      if (headerText.startsWith('<svg') || (headerText.startsWith('<?xml') && headerText.includes('<svg'))) {
        return 'image/svg+xml';
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // --- Lazy Loading for HEIC Conversion (Pinned CDN with SRI) ---
  async function loadHeic2any() {
    if (window.heic2any) return window.heic2any;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      script.integrity = 'sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL';
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.heic2any);
      script.onerror = () => reject(new Error('Failed to load HEIC converter'));
      document.head.appendChild(script);
    });
  }

  // --- Strict Image Validation, Decoding & Canvas Sanitization ---
  async function validateAndProcessImage(file) {
    // 1. File Size Check (10 MB max, > 0 bytes)
    if (!file || file.size === 0) {
      return { success: false, error: 'Please select a valid image file.' };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { success: false, error: 'Image is too large. Maximum size is 10 MB.' };
    }

    // 2. MIME type hint check
    if (file.type && !file.type.startsWith('image/')) {
      return { success: false, error: 'Please select a valid image file.' };
    }

    // 3. Real file type verification by reading magic bytes
    const detectedMime = await detectImageSignature(file);
    if (!detectedMime) {
      return { success: false, error: 'Please select a valid image file.' };
    }

    let sourceBlob = file;

    // 4. Handle HEIC/HEIF conversion if needed
    if (detectedMime === 'image/heic') {
      try {
        const heicConverter = await loadHeic2any();
        const converted = await heicConverter({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.85
        });
        sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      } catch (err) {
        return { success: false, error: 'This image could not be read. Please try another file.' };
      }
    }

    // 5. Decode Image & Check Dimensions / Pixel Bombs
    let imageWidth = 0;
    let imageHeight = 0;
    let imageSource = null;

    if (detectedMime === 'image/svg+xml') {
      // SVG: NEVER insert into DOM. Render exclusively via an isolated Image with Blob URL
      try {
        const svgUrl = URL.createObjectURL(sourceBlob);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('SVG decode failed'));
          img.src = svgUrl;
        });
        URL.revokeObjectURL(svgUrl);
        imageWidth = img.naturalWidth || 800;
        imageHeight = img.naturalHeight || 1200;
        imageSource = img;
      } catch (err) {
        return { success: false, error: 'This image could not be read. Please try another file.' };
      }
    } else {
      // Raster formats: decode with createImageBitmap or Image
      try {
        if (typeof createImageBitmap === 'function') {
          imageSource = await createImageBitmap(sourceBlob);
          imageWidth = imageSource.width;
          imageHeight = imageSource.height;
        } else {
          const imgUrl = URL.createObjectURL(sourceBlob);
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = imgUrl;
          });
          URL.revokeObjectURL(imgUrl);
          imageWidth = img.naturalWidth;
          imageHeight = img.naturalHeight;
          imageSource = img;
        }
      } catch (err) {
        return { success: false, error: 'This image could not be read. Please try another file.' };
      }
    }

    // Check Dimensions (10,000 x 10,000 px max, 50 megapixels max)
    if (
      imageWidth > MAX_IMAGE_DIMENSION ||
      imageHeight > MAX_IMAGE_DIMENSION ||
      imageWidth * imageHeight > MAX_IMAGE_PIXELS
    ) {
      if (imageSource && typeof imageSource.close === 'function') imageSource.close();
      return { success: false, error: 'Image dimensions are too large.' };
    }

    if (imageWidth === 0 || imageHeight === 0) {
      if (imageSource && typeof imageSource.close === 'function') imageSource.close();
      return { success: false, error: 'This image could not be read. Please try another file.' };
    }

    // 6. Re-encode through Canvas:
    // Resize so longest side is at most 1200px (strips EXIF, scripts, payloads, rasterizes SVG)
    let targetWidth = imageWidth;
    let targetHeight = imageHeight;

    if (Math.max(imageWidth, imageHeight) > MAX_CANVAS_SIDE) {
      if (imageWidth >= imageHeight) {
        targetWidth = MAX_CANVAS_SIDE;
        targetHeight = Math.round((imageHeight * MAX_CANVAS_SIDE) / imageWidth);
      } else {
        targetHeight = MAX_CANVAS_SIDE;
        targetWidth = Math.round((imageWidth * MAX_CANVAS_SIDE) / imageHeight);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    // Fill canvas with white background (handles transparent PNG/SVG)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

    if (imageSource && typeof imageSource.close === 'function') {
      imageSource.close();
    }

    // Output as image/webp (or image/jpeg fallback)
    const sanitizedBlob = await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else {
            canvas.toBlob((jpegBlob) => resolve(jpegBlob), 'image/jpeg', 0.85);
          }
        },
        'image/webp',
        0.85
      );
    });

    if (!sanitizedBlob) {
      return { success: false, error: 'This image could not be read. Please try another file.' };
    }

    let formatLabel = 'IMAGE';
    if (detectedMime === 'image/jpeg') formatLabel = 'JPEG';
    else if (detectedMime === 'image/png') formatLabel = 'PNG';
    else if (detectedMime === 'image/webp') formatLabel = 'WEBP';
    else if (detectedMime === 'image/gif') formatLabel = 'GIF';
    else if (detectedMime === 'image/svg+xml') formatLabel = 'SVG';
    else if (detectedMime === 'image/avif') formatLabel = 'AVIF';
    else if (detectedMime === 'image/heic') formatLabel = 'HEIC';
    else if (detectedMime === 'image/bmp') formatLabel = 'BMP';
    else if (detectedMime === 'image/tiff') formatLabel = 'TIFF';

    return { 
      success: true, 
      blob: sanitizedBlob,
      width: targetWidth,
      height: targetHeight,
      originalWidth: imageWidth,
      originalHeight: imageHeight,
      format: formatLabel,
      detectedMime
    };
  }

  // --- Form Validation (Title, Author, Status) ---
  function validateTextInputs(rawTitle, rawAuthor, rawStatus, existingId = null) {
    const title = normalizeText(rawTitle);
    const author = normalizeText(rawAuthor);

    const errors = {
      title: '',
      author: '',
      status: '',
      general: '',
      isValid: true,
      firstInvalidInput: null
    };

    // Title checks
    if (!title) {
      errors.title = 'Book title is required.';
      errors.isValid = false;
      if (!errors.firstInvalidInput) errors.firstInvalidInput = dom.bookTitleInput;
    } else if (title.length > MAX_TITLE_LENGTH) {
      errors.title = `Book title cannot exceed ${MAX_TITLE_LENGTH} characters.`;
      errors.isValid = false;
      if (!errors.firstInvalidInput) errors.firstInvalidInput = dom.bookTitleInput;
    } else if (!ALPHANUMERIC_REGEX.test(title)) {
      errors.title = 'Title must contain at least one letter or number.';
      errors.isValid = false;
      if (!errors.firstInvalidInput) errors.firstInvalidInput = dom.bookTitleInput;
    }

    // Author checks
    if (!author) {
      errors.author = 'Author name is required.';
      errors.isValid = false;
      if (!errors.firstInvalidInput) errors.firstInvalidInput = dom.bookAuthorInput;
    } else if (author.length > MAX_AUTHOR_LENGTH) {
      errors.author = `Author name cannot exceed ${MAX_AUTHOR_LENGTH} characters.`;
      errors.isValid = false;
      if (!errors.firstInvalidInput) errors.firstInvalidInput = dom.bookAuthorInput;
    } else if (!ALPHANUMERIC_REGEX.test(author)) {
      errors.author = 'Author name must contain at least one letter or number.';
      errors.isValid = false;
      if (!errors.firstInvalidInput) errors.firstInvalidInput = dom.bookAuthorInput;
    }

    // Status Whitelist Check
    const validatedStatus = ALLOWED_STATUSES.includes(rawStatus) ? rawStatus : DEFAULT_STATUS;

    // Duplicate Check (same title + author, case-insensitive)
    const lowerTitle = title.toLowerCase();
    const lowerAuthor = author.toLowerCase();

    const isDuplicate = books.some((b) => {
      if (existingId && b.id === existingId) return false;
      return b.title.toLowerCase() === lowerTitle && b.author.toLowerCase() === lowerAuthor;
    });

    if (isDuplicate) {
      errors.general = 'A book with this title and author already exists on your shelf.';
      errors.isValid = false;
    }

    // Max Books Limit Check (10,000 books) with FIFO Eviction for Finished Books
    if (!existingId && books.length >= MAX_BOOKS_LIMIT) {
      const isReadOrReading = (validatedStatus === 'to-read' || validatedStatus === 'reading');
      const hasFinishedBook = books.some((b) => b.status === 'finished' || b.status === 'Finished');

      if (isReadOrReading && hasFinishedBook) {
        // Allowed: The earliest finished book will be automatically removed on submit to make room
      } else if (isReadOrReading && !hasFinishedBook) {
        errors.general = `Library capacity reached (${MAX_BOOKS_LIMIT.toLocaleString()} books). No finished books available to remove.`;
        errors.isValid = false;
      } else {
        errors.general = `Library capacity reached (${MAX_BOOKS_LIMIT.toLocaleString()} books). Adding a "To Read" or "Currently Reading" book will automatically replace your earliest finished book.`;
        errors.isValid = false;
      }
    }

    return {
      isValid: errors.isValid,
      title,
      author,
      status: validatedStatus,
      errors
    };
  }

  // --- Earliest Finished Book Helper (Capacity Eviction) ---
  function getEarliestFinishedBook() {
    let earliest = null;
    for (let i = 0; i < books.length; i++) {
      const b = books[i];
      if (b.status === 'finished' || b.status === 'Finished') {
        if (!earliest) {
          earliest = b;
        } else {
          const earliestTime = typeof earliest.createdAt === 'number' ? earliest.createdAt : Infinity;
          const currentTime = typeof b.createdAt === 'number' ? b.createdAt : Infinity;
          if (currentTime < earliestTime) {
            earliest = b;
          }
        }
      }
    }
    return earliest;
  }

  // --- Statistics Calculation ---
  function renderStats() {
    const total = books.length;
    let toReadCount = 0;
    let readingCount = 0;
    let finishedCount = 0;

    for (let i = 0; i < total; i++) {
      const st = books[i].status;
      if (st === 'to-read' || st === 'To read') toReadCount++;
      else if (st === 'reading' || st === 'Reading') readingCount++;
      else if (st === 'finished' || st === 'Finished') finishedCount++;
    }

    if (dom.statTotal) dom.statTotal.textContent = String(total);
    if (dom.statToRead) dom.statToRead.textContent = String(toReadCount);
    if (dom.statReading) dom.statReading.textContent = String(readingCount);
    if (dom.statFinished) dom.statFinished.textContent = String(finishedCount);

    // Dynamic Progress Calculations
    const finishedPct = total > 0 ? Math.round((finishedCount / total) * 100) : 0;
    const readingPct = total > 0 ? (readingCount / total) * 100 : 0;
    const toReadPct = total > 0 ? (toReadCount / total) * 100 : 0;

    if (dom.progressPercentageNum) {
      dom.progressPercentageNum.textContent = `${finishedPct}%`;
    }
    if (dom.progressRatioText) {
      dom.progressRatioText.textContent = `${finishedCount} of ${total} ${total === 1 ? 'book' : 'books'} finished`;
    }
    if (dom.progressStatusSummary) {
      dom.progressStatusSummary.textContent = `${readingCount} reading · ${toReadCount} to read`;
    }
    if (dom.progressChipReading) {
      dom.progressChipReading.textContent = `${readingCount} reading`;
    }
    if (dom.progressChipToread) {
      dom.progressChipToread.textContent = `${toReadCount} to read`;
    }

    // Dynamic Multi-Segment Progress Fill Widths
    if (dom.progressBarFillFinished) {
      dom.progressBarFillFinished.style.width = `${finishedPct}%`;
    }
    if (dom.progressBarFillReading) {
      dom.progressBarFillReading.style.width = `${readingPct}%`;
    }
    if (dom.progressBarFillToread) {
      dom.progressBarFillToread.style.width = `${toReadPct}%`;
    }

    // Dynamic Reading Momentum Message
    if (dom.shelfMomentumMsg) {
      if (total === 0) {
        dom.shelfMomentumMsg.textContent = 'Add your first book to begin tracking your personal shelf!';
      } else if (finishedCount === total && total > 0) {
        dom.shelfMomentumMsg.textContent = 'Incredible! You have finished every book on your shelf.';
      } else if (readingCount > 0) {
        dom.shelfMomentumMsg.textContent = `You are exploring ${readingCount} ${readingCount === 1 ? 'book' : 'books'} right now. Keep turning pages!`;
      } else if (toReadCount > 0) {
        dom.shelfMomentumMsg.textContent = `You have ${toReadCount} ${toReadCount === 1 ? 'book' : 'books'} waiting on your reading list.`;
      } else {
        dom.shelfMomentumMsg.textContent = 'Keep turning pages and celebrating every chapter.';
      }
    }
  }

  // --- Search & Filtering (High-Performance for 5,000+ records) ---
  function getFilteredBooks() {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return books;
    }

    const results = [];
    const len = books.length;
    for (let i = 0; i < len; i++) {
      const book = books[i];
      if (!book._search) {
        book._search = `${book.title} ${book.author}`.toLowerCase();
      }
      if (book._search.includes(query)) {
        results.push(book);
      }
    }
    return results;
  }

  // --- Format Date Added ---
  function formatAddedDate(timestamp) {
    if (!timestamp || isNaN(timestamp)) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return '';
    }
  }

  // --- Bulk Selection Helpers ---
  function updateBulkUI() {
    const count = selectedBooks.size;
    const hasAny = count > 0;
    dom.bulkActionBar.hidden = !hasAny;
    if (dom.bulkCountLabel) {
      dom.bulkCountLabel.textContent = `${count} ${count === 1 ? 'book' : 'books'} selected`;
    }

    // Update select-all checkbox indeterminate/checked state
    const total = activeFilteredBooks.length;
    if (dom.selectAllCheckbox) {
      if (count === 0) {
        dom.selectAllCheckbox.checked = false;
        dom.selectAllCheckbox.indeterminate = false;
      } else if (count === total && total > 0) {
        dom.selectAllCheckbox.checked = true;
        dom.selectAllCheckbox.indeterminate = false;
      } else {
        dom.selectAllCheckbox.checked = false;
        dom.selectAllCheckbox.indeterminate = true;
      }
    }

    // Update each card's checked visual state
    document.querySelectorAll('.book-card').forEach((card) => {
      const id = card.getAttribute('data-id');
      const isSelected = selectedBooks.has(id);
      card.classList.toggle('is-selected', isSelected);
      const cb = card.querySelector('.card-checkbox-input');
      if (cb) cb.checked = isSelected;
    });
  }

  function toggleBookSelection(id, selected) {
    if (selected) {
      selectedBooks.add(id);
    } else {
      selectedBooks.delete(id);
    }
    updateBulkUI();
  }

  function selectAllVisible() {
    activeFilteredBooks.forEach((b) => selectedBooks.add(b.id));
    updateBulkUI();
  }

  function deselectAll() {
    selectedBooks.clear();
    updateBulkUI();
  }

  function bulkDeleteSelected() {
    const ids = [...selectedBooks];
    const total = ids.length;
    if (total === 0) return;

    // Use the customized Delete Confirmation Modal instead of browser default confirm()
    openBulkDeleteModal(ids, dom.bulkDeleteBtn);
  }

  async function executeBatchDelete(ids) {
    const total = ids.length;
    if (total === 0) return;

    isImportInProgress = true;

    // Reset and display the progress modal
    if (dom.importProgressModal) {
      dom.importProgressModal.hidden = false;
      syncScrollLock();
      dom.importProgressTitle.textContent = 'Deleting Selected Books';
      dom.importProgressSubtitle.textContent = `Removing ${total} book${total === 1 ? '' : 's'} from your shelf...`;
      dom.importStatusText.textContent = 'Deleting books...';
      dom.importPercentText.textContent = '0%';
      dom.importProgressFill.style.width = '0%';
      dom.importProgressFill.classList.remove('is-complete');
      dom.importProgressbar.setAttribute('aria-valuenow', '0');
      dom.importProgressbar.setAttribute('aria-valuemax', String(total));

      dom.importStatCompleted.innerHTML = `0 <span class="import-stat-total">/ ${total}</span>`;
      dom.importStatCompletedSub.textContent = '0% done';
      dom.importStatRemaining.textContent = String(total);
      dom.importStatRemainingSub.textContent = `${total} books left`;
      dom.importStatEta.textContent = '< 2s';
      dom.importStatEtaSub.textContent = 'estimated';

      dom.importCurrentTitle.textContent = 'Preparing deletion...';
      dom.importCurrentTitle.title = 'Preparing deletion...';
      dom.importCurrentItemBox.style.display = 'flex';

      dom.importCompleteSummary.hidden = true;
      dom.importProgressDoneBtn.style.display = 'none';

      dom.importTimerBadge.classList.remove('is-complete');
      dom.importProgressIconBox.classList.remove('is-complete');
      dom.importProgressSpinnerIcon.hidden = false;
      dom.importProgressSuccessIcon.hidden = true;
      dom.importRunningTime.textContent = '00:00.0';

      document.addEventListener('keydown', handleModalKeyDown);
    }

    const startTime = performance.now();
    if (importTimerInterval) clearInterval(importTimerInterval);
    importTimerInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      if (dom.importRunningTime) {
        dom.importRunningTime.textContent = formatElapsedTime(elapsed);
      }
    }, 40);

    const targetSteps = Math.min(50, Math.max(6, Math.ceil(total / 10)));
    const batchSize = Math.max(1, Math.ceil(total / targetSteps));
    let processed = 0;

    for (let i = 0; i < total; i++) {
      processed++;
      const id = ids[i];
      const targetBook = books.find((b) => b.id === id);
      const bookTitle = targetBook ? targetBook.title : `Book #${processed}`;

      if (processed % batchSize === 0 || processed === total) {
        const remaining = total - processed;
        const percent = Math.min(100, Math.round((processed / total) * 100));

        if (dom.importCurrentTitle) {
          dom.importCurrentTitle.textContent = bookTitle;
          dom.importCurrentTitle.title = bookTitle;
        }
        if (dom.importPercentText) dom.importPercentText.textContent = `${percent}%`;
        if (dom.importProgressFill) dom.importProgressFill.style.width = `${percent}%`;
        if (dom.importProgressbar) dom.importProgressbar.setAttribute('aria-valuenow', String(percent));
        if (dom.importStatCompleted) {
          dom.importStatCompleted.innerHTML = `${processed} <span class="import-stat-total">/ ${total}</span>`;
        }
        if (dom.importStatCompletedSub) dom.importStatCompletedSub.textContent = `${percent}% done`;
        if (dom.importStatRemaining) dom.importStatRemaining.textContent = String(remaining);
        if (dom.importStatRemainingSub) {
          dom.importStatRemainingSub.textContent = remaining === 1 ? '1 book left' : `${remaining} books left`;
        }

        const elapsedSoFar = performance.now() - startTime;
        if (processed >= 2 && remaining > 0) {
          const msPerBook = elapsedSoFar / processed;
          const remainingMs = remaining * msPerBook;
          if (dom.importStatEta) dom.importStatEta.textContent = formatEtaTime(remainingMs);
        } else if (remaining === 0) {
          if (dom.importStatEta) dom.importStatEta.textContent = 'Saving...';
        }

        if (total <= 6) {
          await new Promise((r) => setTimeout(r, 40));
        } else {
          await new Promise((r) => requestAnimationFrame(r));
        }
      }
    }

    // High-speed atomic IndexedDB bulk delete
    if (db && !inMemoryFallback) {
      try {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        for (let i = 0; i < ids.length; i++) {
          tx.store.delete(ids[i]);
        }
        await tx.done;
      } catch (err) {
        console.error('[READLOG] Bulk delete transaction failed:', err);
      }
    }

    // In-memory update
    const idSet = new Set(ids);
    books = books.filter((b) => !idSet.has(b.id));

    clearInterval(importTimerInterval);
    importTimerInterval = null;
    isImportInProgress = false;

    const totalDurationMs = performance.now() - startTime;
    const finalFormattedTime = formatElapsedTime(totalDurationMs);

    if (dom.importProgressModal) {
      dom.importRunningTime.textContent = finalFormattedTime;
      dom.importTimerBadge.classList.add('is-complete');
      dom.importProgressIconBox.classList.add('is-complete');
      dom.importProgressSpinnerIcon.hidden = true;
      dom.importProgressSuccessIcon.hidden = false;

      dom.importProgressTitle.textContent = 'Bulk Deletion Complete';
      dom.importProgressSubtitle.textContent = `Successfully deleted ${total} book${total === 1 ? '' : 's'}.`;
      dom.importStatusText.textContent = 'Deletion finished!';
      dom.importPercentText.textContent = '100%';
      dom.importProgressFill.style.width = '100%';
      dom.importProgressFill.classList.add('is-complete');
      dom.importProgressbar.setAttribute('aria-valuenow', '100');

      dom.importStatCompleted.innerHTML = `${total} <span class="import-stat-total">/ ${total}</span>`;
      dom.importStatCompletedSub.textContent = '100% complete';
      dom.importStatRemaining.textContent = '0';
      dom.importStatRemainingSub.textContent = 'Finished';
      dom.importStatEta.textContent = 'Done!';
      dom.importStatEtaSub.textContent = `Took ${finalFormattedTime}`;

      dom.importCurrentItemBox.style.display = 'none';

      dom.importSummaryImported.textContent = `${total} book${total === 1 ? '' : 's'} deleted`;
      dom.importSummarySkipped.textContent = '0 errors';
      dom.importSummaryTime.textContent = `Completed in ${finalFormattedTime}`;
      dom.importCompleteSummary.hidden = false;

      dom.importProgressDoneBtn.style.display = 'inline-flex';
      dom.importProgressDoneBtn.textContent = 'Done & View Shelf';
      dom.importProgressDoneBtn.focus();
    }

    deselectAll();
    renderStats();
    renderBooks();
    showToast(`Removed ${total} ${total === 1 ? 'book' : 'books'} from your shelf (${finalFormattedTime}).`, 'info');
  }

  async function bulkSetStatus(newStatus) {
    if (!ALLOWED_STATUSES.includes(newStatus)) return;
    const ids = [...selectedBooks];
    const total = ids.length;
    if (total === 0) return;

    const statusLabel = newStatus === 'to-read' ? 'To read' : newStatus === 'reading' ? 'Reading' : 'Finished';

    isImportInProgress = true;

    // Reset and display the progress modal
    if (dom.importProgressModal) {
      dom.importProgressModal.hidden = false;
      syncScrollLock();
      dom.importProgressTitle.textContent = 'Updating Reading Status';
      dom.importProgressSubtitle.textContent = `Setting status to "${statusLabel}" for ${total} book${total === 1 ? '' : 's'}...`;
      dom.importStatusText.textContent = `Updating to "${statusLabel}"...`;
      dom.importPercentText.textContent = '0%';
      dom.importProgressFill.style.width = '0%';
      dom.importProgressFill.classList.remove('is-complete');
      dom.importProgressbar.setAttribute('aria-valuenow', '0');
      dom.importProgressbar.setAttribute('aria-valuemax', String(total));

      dom.importStatCompleted.innerHTML = `0 <span class="import-stat-total">/ ${total}</span>`;
      dom.importStatCompletedSub.textContent = '0% done';
      dom.importStatRemaining.textContent = String(total);
      dom.importStatRemainingSub.textContent = `${total} books left`;
      dom.importStatEta.textContent = '< 2s';
      dom.importStatEtaSub.textContent = 'estimated';

      dom.importCurrentTitle.textContent = 'Preparing update...';
      dom.importCurrentTitle.title = 'Preparing update...';
      dom.importCurrentItemBox.style.display = 'flex';

      dom.importCompleteSummary.hidden = true;
      dom.importProgressDoneBtn.style.display = 'none';

      dom.importTimerBadge.classList.remove('is-complete');
      dom.importProgressIconBox.classList.remove('is-complete');
      dom.importProgressSpinnerIcon.hidden = false;
      dom.importProgressSuccessIcon.hidden = true;
      dom.importRunningTime.textContent = '00:00.0';

      document.addEventListener('keydown', handleModalKeyDown);
    }

    const startTime = performance.now();
    if (importTimerInterval) clearInterval(importTimerInterval);
    importTimerInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      if (dom.importRunningTime) {
        dom.importRunningTime.textContent = formatElapsedTime(elapsed);
      }
    }, 40);

    const targetSteps = Math.min(50, Math.max(6, Math.ceil(total / 10)));
    const batchSize = Math.max(1, Math.ceil(total / targetSteps));
    let processed = 0;
    const updatedBooks = [];

    for (let i = 0; i < total; i++) {
      processed++;
      const id = ids[i];
      const targetBook = books.find((b) => b.id === id);
      if (targetBook) {
        targetBook.status = newStatus;
        updatedBooks.push(targetBook);
      }
      const bookTitle = targetBook ? targetBook.title : `Book #${processed}`;

      if (processed % batchSize === 0 || processed === total) {
        const remaining = total - processed;
        const percent = Math.min(100, Math.round((processed / total) * 100));

        if (dom.importCurrentTitle) {
          dom.importCurrentTitle.textContent = bookTitle;
          dom.importCurrentTitle.title = bookTitle;
        }
        if (dom.importPercentText) dom.importPercentText.textContent = `${percent}%`;
        if (dom.importProgressFill) dom.importProgressFill.style.width = `${percent}%`;
        if (dom.importProgressbar) dom.importProgressbar.setAttribute('aria-valuenow', String(percent));
        if (dom.importStatCompleted) {
          dom.importStatCompleted.innerHTML = `${processed} <span class="import-stat-total">/ ${total}</span>`;
        }
        if (dom.importStatCompletedSub) dom.importStatCompletedSub.textContent = `${percent}% done`;
        if (dom.importStatRemaining) dom.importStatRemaining.textContent = String(remaining);
        if (dom.importStatRemainingSub) {
          dom.importStatRemainingSub.textContent = remaining === 1 ? '1 book left' : `${remaining} books left`;
        }

        const elapsedSoFar = performance.now() - startTime;
        if (processed >= 2 && remaining > 0) {
          const msPerBook = elapsedSoFar / processed;
          const remainingMs = remaining * msPerBook;
          if (dom.importStatEta) dom.importStatEta.textContent = formatEtaTime(remainingMs);
        } else if (remaining === 0) {
          if (dom.importStatEta) dom.importStatEta.textContent = 'Saving...';
        }

        if (total <= 6) {
          await new Promise((r) => setTimeout(r, 40));
        } else {
          await new Promise((r) => requestAnimationFrame(r));
        }
      }
    }

    // High-speed atomic IndexedDB bulk update
    if (db && !inMemoryFallback) {
      try {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        for (let i = 0; i < updatedBooks.length; i++) {
          tx.store.put(updatedBooks[i]);
        }
        await tx.done;
      } catch (err) {
        console.error('[READLOG] Bulk status update transaction failed:', err);
      }
    }

    clearInterval(importTimerInterval);
    importTimerInterval = null;
    isImportInProgress = false;

    const totalDurationMs = performance.now() - startTime;
    const finalFormattedTime = formatElapsedTime(totalDurationMs);

    if (dom.importProgressModal) {
      dom.importRunningTime.textContent = finalFormattedTime;
      dom.importTimerBadge.classList.add('is-complete');
      dom.importProgressIconBox.classList.add('is-complete');
      dom.importProgressSpinnerIcon.hidden = true;
      dom.importProgressSuccessIcon.hidden = false;

      dom.importProgressTitle.textContent = 'Status Update Complete';
      dom.importProgressSubtitle.textContent = `Set status to "${statusLabel}" for ${updatedBooks.length} book${updatedBooks.length === 1 ? '' : 's'}.`;
      dom.importStatusText.textContent = 'Update finished!';
      dom.importPercentText.textContent = '100%';
      dom.importProgressFill.style.width = '100%';
      dom.importProgressFill.classList.add('is-complete');
      dom.importProgressbar.setAttribute('aria-valuenow', '100');

      dom.importStatCompleted.innerHTML = `${total} <span class="import-stat-total">/ ${total}</span>`;
      dom.importStatCompletedSub.textContent = '100% complete';
      dom.importStatRemaining.textContent = '0';
      dom.importStatRemainingSub.textContent = 'Finished';
      dom.importStatEta.textContent = 'Done!';
      dom.importStatEtaSub.textContent = `Took ${finalFormattedTime}`;

      dom.importCurrentItemBox.style.display = 'none';

      dom.importSummaryImported.textContent = `${updatedBooks.length} book${updatedBooks.length === 1 ? '' : 's'} updated to "${statusLabel}"`;
      dom.importSummarySkipped.textContent = '0 errors';
      dom.importSummaryTime.textContent = `Completed in ${finalFormattedTime}`;
      dom.importCompleteSummary.hidden = false;

      dom.importProgressDoneBtn.style.display = 'inline-flex';
      dom.importProgressDoneBtn.textContent = 'Done & View Shelf';
      dom.importProgressDoneBtn.focus();
    }

    deselectAll();
    renderStats();
    renderBooks();
    showToast(`Updated ${updatedBooks.length} ${updatedBooks.length === 1 ? 'book' : 'books'} to "${statusLabel}" (${finalFormattedTime}).`, 'success');
  }

  // --- Safe DOM Construction for Book Cards ---
  function createBookCardElement(book) {
    const article = document.createElement('article');
    article.className = 'book-card';
    article.setAttribute('data-id', book.id);
    article.setAttribute('data-status', book.status);
    if (selectedBooks.has(book.id)) {
      article.classList.add('is-selected');
    }

    // Selection Checkbox (top-left overlay)
    const cardCheckboxLabel = document.createElement('label');
    cardCheckboxLabel.className = 'card-checkbox-label';
    cardCheckboxLabel.setAttribute('aria-label', `Select "${book.title}"`);
    cardCheckboxLabel.setAttribute('title', `Select "${book.title}"`);

    const cardCheckboxInput = document.createElement('input');
    cardCheckboxInput.type = 'checkbox';
    cardCheckboxInput.className = 'card-checkbox-input';
    cardCheckboxInput.checked = selectedBooks.has(book.id);
    cardCheckboxInput.setAttribute('aria-label', `Select "${book.title}"`);
    cardCheckboxInput.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleBookSelection(book.id, e.target.checked);
    });

    const cardCheckboxCustom = document.createElement('span');
    cardCheckboxCustom.className = 'card-checkbox-custom';
    cardCheckboxCustom.setAttribute('aria-hidden', 'true');

    cardCheckboxLabel.appendChild(cardCheckboxInput);
    cardCheckboxLabel.appendChild(cardCheckboxCustom);
    article.appendChild(cardCheckboxLabel);

    const cardMain = document.createElement('div');
    cardMain.className = 'book-card-main';

    // 1. Cover Thumbnail Box (2:3 Aspect Ratio)
    const coverBox = document.createElement('div');
    coverBox.className = 'card-cover-box';

    if (book.thumbnailBlob instanceof Blob) {
      const img = document.createElement('img');
      img.className = 'card-cover-img';
      img.loading = 'lazy';
      img.alt = `Cover for ${book.title}`;

      const blobUrl = trackObjectUrl(URL.createObjectURL(book.thumbnailBlob));
      img.src = blobUrl;
      coverBox.appendChild(img);
    } else {
      // Elegant book placeholder with SVG icon
      const placeholder = document.createElement('div');
      placeholder.className = 'card-cover-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        <span>ReadLog</span>
      `;
      coverBox.appendChild(placeholder);
    }

    cardMain.appendChild(coverBox);

    // 2. Content Details (Title, Author, Badge, Meta)
    const contentDetails = document.createElement('div');
    contentDetails.className = 'card-content-details';

    // Top Row: Status Badge
    const cardTop = document.createElement('div');
    cardTop.className = 'card-top';

    const statusBadge = document.createElement('span');
    const slug = (book.status || 'to-read').toLowerCase().replace(/\s+/g, '-');
    statusBadge.className = `status-badge status-${slug}`;

    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot';
    statusDot.setAttribute('aria-hidden', 'true');

    let displayStatusLabel = 'To read';
    if (slug === 'reading') displayStatusLabel = 'Reading';
    else if (slug === 'finished') displayStatusLabel = 'Finished';

    statusBadge.appendChild(statusDot);
    statusBadge.appendChild(document.createTextNode(displayStatusLabel));
    cardTop.appendChild(statusBadge);

    // Title & Author (Rendered via textContent to strictly prevent XSS)
    const titleH3 = document.createElement('h3');
    titleH3.className = 'book-title';
    titleH3.textContent = book.title;

    const authorP = document.createElement('p');
    authorP.className = 'book-author';
    const authorPrefix = document.createElement('span');
    authorPrefix.className = 'author-prefix';
    authorPrefix.textContent = 'by ';
    authorP.appendChild(authorPrefix);
    const authorSpan = document.createElement('span');
    authorSpan.className = 'author-name';
    authorSpan.textContent = book.author;
    authorP.appendChild(authorSpan);

    const metaP = document.createElement('p');
    metaP.className = 'card-meta';
    const dateFormatted = formatAddedDate(book.createdAt);
    if (dateFormatted) {
      const calSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      calSvg.setAttribute('width', '11');
      calSvg.setAttribute('height', '11');
      calSvg.setAttribute('viewBox', '0 0 24 24');
      calSvg.setAttribute('fill', 'none');
      calSvg.setAttribute('stroke', 'currentColor');
      calSvg.setAttribute('stroke-width', '2');
      calSvg.setAttribute('stroke-linecap', 'round');
      calSvg.setAttribute('stroke-linejoin', 'round');
      calSvg.setAttribute('aria-hidden', 'true');
      calSvg.innerHTML = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>';

      const dateSpan = document.createElement('span');
      dateSpan.textContent = `Added ${dateFormatted}`;
      metaP.appendChild(calSvg);
      metaP.appendChild(dateSpan);
    }

    contentDetails.appendChild(cardTop);
    contentDetails.appendChild(titleH3);
    contentDetails.appendChild(authorP);
    if (dateFormatted) {
      contentDetails.appendChild(metaP);
    }

    cardMain.appendChild(contentDetails);

    // 3. Card Footer Controls (Status Pill Labels, Edit Button, Delete Button)
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer';

    // Status Pill Labels Group (Segmented outer pill with sliding glass indicator)
    const pillsGroup = document.createElement('div');
    pillsGroup.className = 'card-status-pills';
    pillsGroup.setAttribute('role', 'radiogroup');
    pillsGroup.setAttribute('aria-label', `Reading status for "${book.title}"`);
    pillsGroup.dataset.activeStatus = slug;

    // Sliding glass pill indicator
    const glassSlider = document.createElement('div');
    glassSlider.className = 'pill-glass-slider';
    glassSlider.setAttribute('aria-hidden', 'true');
    pillsGroup.appendChild(glassSlider);

    const statusOptions = [
      { val: 'to-read', label: 'To read' },
      { val: 'reading', label: 'Reading' },
      { val: 'finished', label: 'Finished' }
    ];

    statusOptions.forEach((opt) => {
      const isActive = opt.val === slug;
      const pillBtn = document.createElement('button');
      pillBtn.type = 'button';
      pillBtn.className = `status-pill-btn pill-${opt.val}${isActive ? ' is-active' : ''}`;
      pillBtn.setAttribute('role', 'radio');
      pillBtn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      pillBtn.setAttribute('data-val', opt.val);
      pillBtn.setAttribute('aria-label', `Set status to ${opt.label} for "${book.title}"`);
      pillBtn.title = `${opt.label}${isActive ? ' (Current status)' : ' - Click to set status'}`;

      const dot = document.createElement('span');
      dot.className = 'pill-dot';
      dot.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'pill-label';
      text.textContent = opt.label;

      pillBtn.appendChild(dot);
      pillBtn.appendChild(text);

      pillBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.val !== slug) {
          // Immediately animate the glass slider to the clicked option
          pillsGroup.dataset.activeStatus = opt.val;
          pillsGroup.querySelectorAll('.status-pill-btn').forEach((btn) => {
            const btnVal = btn.getAttribute('data-val');
            const isNowActive = btnVal === opt.val;
            btn.classList.toggle('is-active', isNowActive);
            btn.setAttribute('aria-checked', isNowActive ? 'true' : 'false');
          });

          // Live update card's accent strip & status badge
          const cardEl = pillsGroup.closest('.book-card');
          if (cardEl) {
            cardEl.dataset.status = opt.val;
            const badge = cardEl.querySelector('.status-badge');
            if (badge && badge.lastChild) {
              badge.className = `status-badge status-${opt.val}`;
              badge.lastChild.textContent = opt.label;
            }
          }

          handleStatusChange(book.id, opt.val);
        }
      });

      pillsGroup.appendChild(pillBtn);
    });

    cardFooter.appendChild(pillsGroup);

    // Actions Row (Edit + Delete)
    const actionsRow = document.createElement('div');
    actionsRow.className = 'card-actions-row';

    // Edit Button
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-card-action btn-card-edit';
    editBtn.setAttribute('aria-label', `Edit "${book.title}" by ${book.author}`);
    editBtn.title = `Edit "${book.title}"`;
    editBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span class="btn-card-label">Edit</span>
    `;
    editBtn.addEventListener('click', () => {
      openEditModal(book.id, editBtn);
    });
    actionsRow.appendChild(editBtn);

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-card-action btn-card-delete';
    deleteBtn.setAttribute('aria-label', `Delete "${book.title}" by ${book.author}`);
    deleteBtn.title = `Delete "${book.title}"`;
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
      <span class="btn-card-label">Delete</span>
    `;
    deleteBtn.addEventListener('click', () => {
      openDeleteModal(book.id, book.title, deleteBtn);
    });
    actionsRow.appendChild(deleteBtn);

    cardFooter.appendChild(actionsRow);

    // Assemble Card
    article.appendChild(cardMain);
    article.appendChild(cardFooter);

    return article;
  }

  // --- High-Performance Progressive Batch Rendering & Infinite Scroll Sentinel ---
  const CHUNK_BATCH_SIZE = 36;
  let renderedBooksCount = 0;
  let activeFilteredBooks = [];
  let shelfScrollObserver = null;

  function renderNextBatch() {
    if (renderedBooksCount >= activeFilteredBooks.length) {
      removeScrollSentinel();
      return;
    }

    const nextBatch = activeFilteredBooks.slice(renderedBooksCount, renderedBooksCount + CHUNK_BATCH_SIZE);
    renderedBooksCount += nextBatch.length;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < nextBatch.length; i++) {
      fragment.appendChild(createBookCardElement(nextBatch[i]));
    }

    const sentinel = dom.bookGrid.querySelector('.shelf-scroll-sentinel');
    if (sentinel) {
      dom.bookGrid.insertBefore(fragment, sentinel);
    } else {
      dom.bookGrid.appendChild(fragment);
    }

    if (renderedBooksCount < activeFilteredBooks.length) {
      attachScrollSentinel();
    } else {
      removeScrollSentinel();
    }
  }

  function attachScrollSentinel() {
    let sentinel = dom.bookGrid.querySelector('.shelf-scroll-sentinel');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.className = 'shelf-scroll-sentinel';
      sentinel.setAttribute('aria-hidden', 'true');
      dom.bookGrid.appendChild(sentinel);
    }

    if (!shelfScrollObserver && typeof IntersectionObserver === 'function') {
      shelfScrollObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            renderNextBatch();
            break;
          }
        }
      }, {
        rootMargin: '350px 0px'
      });
    }

    if (shelfScrollObserver && sentinel) {
      shelfScrollObserver.disconnect();
      shelfScrollObserver.observe(sentinel);
    }
  }

  function removeScrollSentinel() {
    if (shelfScrollObserver) {
      shelfScrollObserver.disconnect();
    }
    const sentinel = dom.bookGrid.querySelector('.shelf-scroll-sentinel');
    if (sentinel) {
      sentinel.remove();
    }
  }

  // --- Render Shelf View ---
  function renderBooks(preserveScroll = true) {
    const savedScrollY = preserveScroll ? window.scrollY : 0;
    const currentGridHeight = dom.bookGrid ? dom.bookGrid.offsetHeight : 0;

    // Lock minimum height during re-render so page height doesn't collapse and jump scroll to top
    if (dom.bookGrid && currentGridHeight > 0) {
      dom.bookGrid.style.minHeight = `${currentGridHeight}px`;
    }

    activeFilteredBooks = getFilteredBooks();
    const totalCount = books.length;
    const queryActive = searchQuery.trim().length > 0;

    if (queryActive) {
      dom.shelfCountBadge.textContent = `${activeFilteredBooks.length} of ${totalCount} ${totalCount === 1 ? 'book' : 'books'}`;
    } else {
      dom.shelfCountBadge.textContent = `${totalCount} ${totalCount === 1 ? 'book' : 'books'}`;
    }

    dom.clearSearchBtn.hidden = !queryActive;

    if (totalCount === 0) {
      dom.bookGrid.hidden = true;
      dom.bookGrid.innerHTML = '';
      dom.bookGrid.style.minHeight = '';
      removeScrollSentinel();
      dom.noResultsState.hidden = true;
      dom.emptyShelfState.hidden = false;
      return;
    }

    if (queryActive && activeFilteredBooks.length === 0) {
      dom.bookGrid.hidden = true;
      dom.bookGrid.innerHTML = '';
      dom.bookGrid.style.minHeight = '';
      removeScrollSentinel();
      dom.emptyShelfState.hidden = true;
      dom.noResultsQuery.textContent = searchQuery.trim();
      dom.noResultsState.hidden = false;
      return;
    }

    dom.emptyShelfState.hidden = true;
    dom.noResultsState.hidden = true;
    dom.bookGrid.hidden = false;

    // Fast initial batch rendering
    dom.bookGrid.innerHTML = '';
    renderedBooksCount = 0;
    renderNextBatch();

    if (preserveScroll && savedScrollY > 0) {
      window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    }

    requestAnimationFrame(() => {
      if (dom.bookGrid) {
        dom.bookGrid.style.minHeight = '';
      }
    });
  }

  // --- Status Transition Handler ---
  async function handleStatusChange(id, newStatus) {
    if (!ALLOWED_STATUSES.includes(newStatus)) return;

    const book = books.find((b) => b.id === id);
    if (!book) return;

    book.status = newStatus;
    await saveBookToDb(book);
    renderStats();
    // Allow the smooth glass slider transition to glide across naturally
    await new Promise((resolve) => setTimeout(resolve, 220));
    renderBooks();

    const statusLabel = newStatus === 'to-read' ? 'To read' : newStatus === 'reading' ? 'Reading' : 'Finished';
    showToast(`Status for "${book.title}" updated to "${statusLabel}".`, 'info');
  }

  // --- Accessibility Announcements for Thumbnail Changes ---
  function announceThumbnailStatus(message) {
    if (dom.thumbnailSrStatus) {
      dom.thumbnailSrStatus.textContent = '';
      setTimeout(() => {
        dom.thumbnailSrStatus.textContent = message;
      }, 50);
    }
  }

  // --- Inline Error State Handling (Red dashed border + Alert icon message) ---
  function setThumbnailError(message) {
    if (dom.thumbnailDropzone) {
      dom.thumbnailDropzone.classList.add('has-error');
      dom.thumbnailDropzone.setAttribute('aria-invalid', 'true');
    }
    if (dom.thumbnailError) {
      if (message) {
        dom.thumbnailError.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>${escapeHtml(message)}</span>
        `;
        announceThumbnailStatus(`Error: ${message}`);
      } else {
        dom.thumbnailError.innerHTML = '';
      }
    }
  }

  function clearThumbnailErrors() {
    if (dom.thumbnailDropzone) {
      dom.thumbnailDropzone.classList.remove('has-error');
      dom.thumbnailDropzone.removeAttribute('aria-invalid');
    }
    if (dom.thumbnailError) {
      dom.thumbnailError.innerHTML = '';
    }
    if (dom.thumbnailNotice) {
      dom.thumbnailNotice.textContent = '';
    }
  }

  // --- Dropzone & Thumbnail Processing ---
  async function handleThumbnailFileSelected(file) {
    clearThumbnailErrors();
    dom.thumbnailLoading.hidden = false;
    dom.dropzonePrompt.hidden = true;
    if (dom.dropzoneDragoverPrompt) dom.dropzoneDragoverPrompt.hidden = true;
    if (dom.thumbnailPreviewCard) dom.thumbnailPreviewCard.hidden = true;

    try {
      const result = await validateAndProcessImage(file);
      dom.thumbnailLoading.hidden = true;

      if (!result.success) {
        currentThumbnailBlob = null;
        dom.dropzonePrompt.hidden = false;
        setThumbnailError(result.error);
        return;
      }

      // Accepted & Sanitized
      currentThumbnailBlob = result.blob;

      if (currentPreviewUrl) {
        revokeTrackedUrl(currentPreviewUrl);
      }
      currentPreviewUrl = trackObjectUrl(URL.createObjectURL(currentThumbnailBlob));
      dom.thumbnailPreviewImg.src = currentPreviewUrl;

      // Populate File Details Card
      const fileName = file.name || 'cover-thumbnail';
      if (dom.previewFilename) {
        dom.previewFilename.textContent = fileName;
        dom.previewFilename.title = fileName;
      }
      if (dom.previewFormat) {
        dom.previewFormat.textContent = result.format || 'WEBP';
      }
      if (dom.previewFilesize) {
        dom.previewFilesize.textContent = formatBytes(result.blob.size || file.size);
      }
      if (dom.previewDimensions) {
        dom.previewDimensions.textContent = `${result.width} × ${result.height} px`;
      }

      if (dom.thumbnailPreviewCard) dom.thumbnailPreviewCard.hidden = false;
      dom.dropzonePrompt.hidden = true;
      if (dom.dropzoneDragoverPrompt) dom.dropzoneDragoverPrompt.hidden = true;

      announceThumbnailStatus(`Image selected: ${fileName}`);
    } catch (err) {
      dom.thumbnailLoading.hidden = true;
      dom.dropzonePrompt.hidden = false;
      setThumbnailError('This image could not be read. Please try another file.');
    }
  }

  function removeThumbnail() {
    currentThumbnailBlob = null;
    if (currentPreviewUrl) {
      revokeTrackedUrl(currentPreviewUrl);
      currentPreviewUrl = null;
    }
    dom.bookThumbnailInput.value = '';
    if (dom.thumbnailPreviewCard) dom.thumbnailPreviewCard.hidden = true;
    dom.dropzonePrompt.hidden = false;
    if (dom.dropzoneDragoverPrompt) dom.dropzoneDragoverPrompt.hidden = true;
    clearThumbnailErrors();
    announceThumbnailStatus('Image removed');
  }

  function clearThumbnailMessages() {
    clearThumbnailErrors();
  }

  // --- Add Book Form Submit Handler ---
  async function handleAddBookSubmit(e) {
    e.preventDefault();

    // Disable button to prevent double submits
    dom.addBookBtn.disabled = true;
    dom.addBookBtnText.textContent = 'Adding Book...';

    const rawTitle = dom.bookTitleInput.value;
    const rawAuthor = dom.bookAuthorInput.value;
    const rawStatus = dom.bookStatusSelect.value;

    // Clear previous inline errors
    clearFormErrors();

    const validation = validateTextInputs(rawTitle, rawAuthor, rawStatus);

    if (!validation.isValid) {
      if (validation.errors.title) {
        dom.titleError.textContent = validation.errors.title;
        dom.bookTitleInput.classList.add('is-invalid');
      }
      if (validation.errors.author) {
        dom.authorError.textContent = validation.errors.author;
        dom.bookAuthorInput.classList.add('is-invalid');
      }
      if (validation.errors.general) {
        dom.formGeneralError.textContent = validation.errors.general;
      }
      if (validation.errors.firstInvalidInput) {
        validation.errors.firstInvalidInput.focus();
      }

      dom.addBookBtn.disabled = false;
      dom.addBookBtnText.textContent = 'Add Book';
      return;
    }

    // FIFO Eviction Policy at 10,000 capacity:
    // If shelf is full and adding a 'to-read' or 'reading' book, remove the earliest finished book first
    let evictedFinishedBook = null;
    if (books.length >= MAX_BOOKS_LIMIT && (validation.status === 'to-read' || validation.status === 'reading')) {
      evictedFinishedBook = getEarliestFinishedBook();
      if (evictedFinishedBook) {
        await deleteBookFromDb(evictedFinishedBook.id);
        books = books.filter((b) => b.id !== evictedFinishedBook.id);
        const oldCardEl = dom.bookGrid.querySelector(`.book-card[data-id="${evictedFinishedBook.id}"]`);
        if (oldCardEl) oldCardEl.remove();
      }
    }

    // Create Book Object
    const newBook = {
      id: generateId(),
      title: validation.title,
      author: validation.author,
      status: validation.status,
      createdAt: Date.now(),
      thumbnailBlob: currentThumbnailBlob
    };

    // Save Book to Database
    const saved = await saveBookToDb(newBook);

    if (saved) {
      books.unshift(newBook);

      // Reset form
      dom.bookTitleInput.value = '';
      dom.bookAuthorInput.value = '';
      dom.bookStatusSelect.value = DEFAULT_STATUS;
      if (addCustomSelect) {
        addCustomSelect.setValue(DEFAULT_STATUS, false);
      }
      updateCharCounter(dom.bookTitleInput, dom.titleCharCount, MAX_TITLE_LENGTH);
      updateCharCounter(dom.bookAuthorInput, dom.authorCharCount, MAX_AUTHOR_LENGTH);
      removeThumbnail();

      renderStats();
      renderBooks();

      if (evictedFinishedBook) {
        showToast(
          `Shelf full (10,000 books): Removed oldest finished book "${evictedFinishedBook.title}" to add "${newBook.title}".`,
          'info'
        );
      }

      if (window.innerWidth > 640) {
        dom.bookTitleInput.focus({ preventScroll: true });
      } else if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } else if (evictedFinishedBook) {
      // Rollback evicted book if new book save failed
      await saveBookToDb(evictedFinishedBook);
      books.push(evictedFinishedBook);
      renderStats();
      renderBooks();
    }

    dom.addBookBtn.disabled = false;
    dom.addBookBtnText.textContent = 'Add Book';
  }

  function clearFormErrors() {
    dom.titleError.textContent = '';
    dom.authorError.textContent = '';
    dom.formGeneralError.textContent = '';
    dom.bookTitleInput.classList.remove('is-invalid');
    dom.bookAuthorInput.classList.remove('is-invalid');
  }

  function updateCharCounter(inputEl, counterEl, maxLen) {
    const len = inputEl.value.length;
    counterEl.textContent = `${len} / ${maxLen}`;
    if (len >= maxLen) {
      counterEl.classList.add('is-limit');
    } else {
      counterEl.classList.remove('is-limit');
    }
  }

  // --- Background Scroll Lock Manager for Modals/Popups ---
  function syncScrollLock() {
    const isAnyModalOpen = [
      dom.deleteModal,
      dom.editModal,
      dom.importModal,
      dom.importProgressModal
    ].some((modal) => modal && !modal.hidden);

    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
  }

  // --- Edit Book Modal Logic ---
  function openEditModal(bookId, triggerElement) {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    editingBookId = bookId;
    lastActiveElementBeforeModal = triggerElement;
    editThumbnailBlob = book.thumbnailBlob || null;
    editRemoveCoverFlag = false;

    // Populate fields
    dom.editBookTitle.value = book.title;
    dom.editBookAuthor.value = book.author;
    dom.editBookStatus.value = book.status;
    if (editCustomSelect) {
      editCustomSelect.setValue(book.status, false);
    }

    updateCharCounter(dom.editBookTitle, dom.editTitleCharCount, MAX_TITLE_LENGTH);
    updateCharCounter(dom.editBookAuthor, dom.editAuthorCharCount, MAX_AUTHOR_LENGTH);

    // Populate thumbnail preview
    if (editPreviewUrl) {
      revokeTrackedUrl(editPreviewUrl);
      editPreviewUrl = null;
    }

    if (editThumbnailBlob instanceof Blob) {
      editPreviewUrl = trackObjectUrl(URL.createObjectURL(editThumbnailBlob));
      dom.editThumbPreviewImg.src = editPreviewUrl;
      dom.editThumbPreviewImg.hidden = false;
      dom.editThumbPlaceholder.hidden = true;
      dom.editRemoveThumbBtn.hidden = false;
    } else {
      dom.editThumbPreviewImg.hidden = true;
      dom.editThumbPlaceholder.hidden = false;
      dom.editRemoveThumbBtn.hidden = true;
    }

    dom.editTitleError.textContent = '';
    dom.editAuthorError.textContent = '';
    dom.editThumbnailError.textContent = '';
    dom.editGeneralError.textContent = '';

    dom.editModal.hidden = false;
    syncScrollLock();
    dom.editBookTitle.focus();
    document.addEventListener('keydown', handleModalKeyDown);
  }

  function closeEditModal() {
    dom.editModal.hidden = true;
    syncScrollLock();
    editingBookId = null;
    editThumbnailBlob = null;
    editRemoveCoverFlag = false;

    if (editPreviewUrl) {
      revokeTrackedUrl(editPreviewUrl);
      editPreviewUrl = null;
    }

    document.removeEventListener('keydown', handleModalKeyDown);
    if (lastActiveElementBeforeModal && typeof lastActiveElementBeforeModal.focus === 'function') {
      lastActiveElementBeforeModal.focus();
    }
  }

  async function handleEditFormSubmit(e) {
    e.preventDefault();
    if (!editingBookId) return;

    const book = books.find((b) => b.id === editingBookId);
    if (!book) return;

    const rawTitle = dom.editBookTitle.value;
    const rawAuthor = dom.editBookAuthor.value;
    const rawStatus = dom.editBookStatus.value;

    dom.editTitleError.textContent = '';
    dom.editAuthorError.textContent = '';
    dom.editGeneralError.textContent = '';

    const validation = validateTextInputs(rawTitle, rawAuthor, rawStatus, editingBookId);

    if (!validation.isValid) {
      if (validation.errors.title) dom.editTitleError.textContent = validation.errors.title;
      if (validation.errors.author) dom.editAuthorError.textContent = validation.errors.author;
      if (validation.errors.general) dom.editGeneralError.textContent = validation.errors.general;
      return;
    }

    // Update book
    book.title = validation.title;
    book.author = validation.author;
    book.status = validation.status;
    delete book._search;

    if (editRemoveCoverFlag) {
      book.thumbnailBlob = null;
    } else if (editThumbnailBlob instanceof Blob) {
      book.thumbnailBlob = editThumbnailBlob;
    }

    const saved = await saveBookToDb(book);
    if (saved) {
      renderStats();
      renderBooks();
      showToast(`Updated "${book.title}".`, 'success');
      closeEditModal();
    }
  }

  // --- Delete Modal Logic (Supports Single Book and Bulk Selection) ---
  function openDeleteModal(bookId, bookTitle, triggerElement) {
    pendingDeleteId = bookId;
    pendingBulkDeleteIds = null;
    lastActiveElementBeforeModal = triggerElement;

    if (dom.deleteModalTitle) dom.deleteModalTitle.textContent = 'Delete Book';
    if (dom.deleteBookName) dom.deleteBookName.textContent = `"${bookTitle}"`;
    if (dom.confirmDeleteBtn) dom.confirmDeleteBtn.textContent = 'Delete Book';

    dom.deleteModal.hidden = false;
    syncScrollLock();
    dom.cancelDeleteBtn.focus();
    document.addEventListener('keydown', handleModalKeyDown);
  }

  function openBulkDeleteModal(ids, triggerElement) {
    if (!ids || ids.length === 0) return;
    pendingDeleteId = null;
    pendingBulkDeleteIds = ids;
    lastActiveElementBeforeModal = triggerElement || dom.bulkDeleteBtn;

    const count = ids.length;
    const titleText = count === 1 ? 'Delete Selected Book' : 'Delete Selected Books';
    const bookLabel = count === 1 ? '1 selected book' : `${count} selected books`;
    const btnLabel = count === 1 ? 'Delete Book' : `Delete ${count} Books`;

    if (dom.deleteModalTitle) dom.deleteModalTitle.textContent = titleText;
    if (dom.deleteBookName) dom.deleteBookName.textContent = bookLabel;
    if (dom.confirmDeleteBtn) dom.confirmDeleteBtn.textContent = btnLabel;

    dom.deleteModal.hidden = false;
    syncScrollLock();
    dom.cancelDeleteBtn.focus();
    document.addEventListener('keydown', handleModalKeyDown);
  }

  function closeDeleteModal() {
    dom.deleteModal.hidden = true;
    syncScrollLock();
    pendingDeleteId = null;
    pendingBulkDeleteIds = null;
    document.removeEventListener('keydown', handleModalKeyDown);
    if (lastActiveElementBeforeModal && typeof lastActiveElementBeforeModal.focus === 'function') {
      lastActiveElementBeforeModal.focus();
    }
  }

  async function confirmDelete() {
    // 1. Bulk Delete Mode
    if (pendingBulkDeleteIds && pendingBulkDeleteIds.length > 0) {
      const idsToDelete = [...pendingBulkDeleteIds];
      closeDeleteModal();
      await executeBatchDelete(idsToDelete);
      return;
    }

    // 2. Individual Single Book Delete Mode
    if (!pendingDeleteId) return;

    const targetId = pendingDeleteId;
    const targetBook = books.find((b) => b.id === targetId);
    const bookTitle = targetBook ? targetBook.title : 'Book';

    books = books.filter((b) => b.id !== targetId);
    await deleteBookFromDb(targetId);

    // Remove the card directly from the DOM without collapsing page height or scrolling to top
    const cardEl = dom.bookGrid.querySelector(`.book-card[data-id="${targetId}"]`);
    if (cardEl) {
      cardEl.remove();
    }

    renderStats();
    activeFilteredBooks = getFilteredBooks();
    const totalCount = books.length;
    const queryActive = searchQuery.trim().length > 0;
    if (queryActive) {
      dom.shelfCountBadge.textContent = `${activeFilteredBooks.length} of ${totalCount} ${totalCount === 1 ? 'book' : 'books'}`;
    } else {
      dom.shelfCountBadge.textContent = `${totalCount} ${totalCount === 1 ? 'book' : 'books'}`;
    }

    // Only re-render if empty state needed
    if (totalCount === 0 || (queryActive && activeFilteredBooks.length === 0)) {
      renderBooks(true);
    }

    showToast(`Removed "${bookTitle}" from your shelf.`, 'info');

    dom.deleteModal.hidden = true;
    syncScrollLock();
    pendingDeleteId = null;
    pendingBulkDeleteIds = null;
    document.removeEventListener('keydown', handleModalKeyDown);

    // Explicitly blur so the page never scrolls to top and mobile keyboard NEVER opens uninvited!
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  function handleModalKeyDown(e) {
    if (e.key === 'Escape') {
      if (!dom.deleteModal.hidden) closeDeleteModal();
      if (!dom.editModal.hidden) closeEditModal();
      if (!dom.importModal.hidden) closeImportModal();
      if (dom.importProgressModal && !dom.importProgressModal.hidden && !isImportInProgress) {
        closeImportProgressModal();
      }
    } else if (e.key === 'Enter') {
      if (dom.importProgressModal && !dom.importProgressModal.hidden && !isImportInProgress) {
        closeImportProgressModal();
      }
    }
  }

  // --- Backup Export Logic ---
  async function exportBackup() {
    if (books.length === 0) {
      showToast('Your shelf is empty. Add some books before exporting.', 'info');
      return;
    }

    try {
      showToast('Preparing backup with covers...', 'info');

      const serializedBooks = [];
      for (const book of books) {
        let thumbnailDataUrl = null;
        if (book.thumbnailBlob instanceof Blob) {
          thumbnailDataUrl = await blobToDataUrl(book.thumbnailBlob);
        }

        serializedBooks.push({
          title: book.title,
          author: book.author,
          status: book.status,
          createdAt: book.createdAt,
          thumbnailDataUrl
        });
      }

      const backupObject = {
        version: 1,
        exportedAt: new Date().toISOString(),
        books: serializedBooks
      };

      const jsonString = JSON.stringify(backupObject, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const downloadUrl = trackObjectUrl(URL.createObjectURL(blob));

      const today = new Date().toISOString().split('T')[0];
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `readlog-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      revokeTrackedUrl(downloadUrl);

      showToast(`Backup exported (${serializedBooks.length} books).`, 'success');
    } catch (err) {
      console.error('[READLOG] Backup export failed:', err);
      showToast('Failed to export backup. Please try again.', 'error');
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function fastDataUrlToBlob(dataUrl) {
    try {
      if (!dataUrl || typeof dataUrl !== 'string') return null;
      const parts = dataUrl.split(',');
      if (parts.length !== 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      if (!mime.startsWith('image/')) return null;
      const binary = atob(parts[1]);
      const len = binary.length;
      if (len > MAX_IMAGE_BYTES) return null;
      const u8arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8arr[i] = binary.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  function dataUrlToBlob(dataUrl) {
    return Promise.resolve(fastDataUrlToBlob(dataUrl));
  }

  // --- Backup Import Logic with Strict Schema & Prototype Pollution Guard ---
  function handleBackupFileSelected(file) {
    if (!file) return;

    // Reject files exceeding 100 MB
    if (file.size > BACKUP_MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      showToast(`Backup file exceeds the 100 MB limit (${sizeMb} MB). Import rejected.`, 'error');
      dom.backupFileInput.value = '';
      pendingImportPayload = null;
      return;
    }

    // Reject empty 0-byte files
    if (file.size === 0) {
      showToast('Selected backup file is empty (0 bytes). Import rejected.', 'error');
      dom.backupFileInput.value = '';
      pendingImportPayload = null;
      return;
    }

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      showToast('Please select a valid .json backup file.', 'error');
      dom.backupFileInput.value = '';
      pendingImportPayload = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        // Prototype Pollution Protection: custom reviver rejecting dangerous keys
        const parsed = JSON.parse(reader.result, (key, value) => {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
          }
          return value;
        });

        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.books)) {
          showToast('Invalid backup file structure.', 'error');
          dom.backupFileInput.value = '';
          return;
        }

        if (parsed.books.length === 0) {
          showToast('Backup file contains no books.', 'info');
          dom.backupFileInput.value = '';
          return;
        }

        pendingImportPayload = parsed.books;
        dom.importBooksCount.textContent = `${parsed.books.length} books`;
        dom.importModal.hidden = false;
        syncScrollLock();
        dom.importMergeBtn.focus();
        document.addEventListener('keydown', handleModalKeyDown);
      } catch (err) {
        showToast('Failed to parse backup JSON file.', 'error');
        dom.backupFileInput.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Error reading backup file.', 'error');
      dom.backupFileInput.value = '';
    };

    reader.readAsText(file);
  }

  function closeImportModal() {
    dom.importModal.hidden = true;
    syncScrollLock();
    pendingImportPayload = null;
    dom.backupFileInput.value = '';
    document.removeEventListener('keydown', handleModalKeyDown);
  }

  let importTimerInterval = null;
  let isImportInProgress = false;

  function formatElapsedTime(ms) {
    if (!ms || ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    const padM = String(minutes).padStart(2, '0');
    const padS = String(seconds).padStart(2, '0');
    return `${padM}:${padS}.${tenths}`;
  }

  function formatEtaTime(ms) {
    if (!isFinite(ms) || ms <= 0) return '~00:00';
    const totalSeconds = Math.ceil(ms / 1000);
    if (totalSeconds < 1) return '< 1s';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
      return `~${seconds}s`;
    }
    const padM = String(minutes).padStart(2, '0');
    const padS = String(seconds).padStart(2, '0');
    return `~${padM}:${padS}`;
  }

  function closeImportProgressModal() {
    if (isImportInProgress) return;
    if (dom.importProgressModal) {
      dom.importProgressModal.hidden = true;
      syncScrollLock();
    }
    document.removeEventListener('keydown', handleModalKeyDown);
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  async function executeImport(mode) {
    if (!pendingImportPayload || !Array.isArray(pendingImportPayload)) return;

    const rawList = pendingImportPayload;
    const total = rawList.length;
    closeImportModal();

    isImportInProgress = true;

    // Reset and display the progress popup
    if (dom.importProgressModal) {
      dom.importProgressModal.hidden = false;
      syncScrollLock();
      dom.importProgressTitle.textContent = mode === 'replace' ? 'Restoring Shelf (Replace)' : 'Restoring Shelf (Merge)';
      dom.importProgressSubtitle.textContent = `Restoring ${total} book${total === 1 ? '' : 's'} to your shelf...`;
      dom.importStatusText.textContent = 'Importing books...';
      dom.importPercentText.textContent = '0%';
      dom.importProgressFill.style.width = '0%';
      dom.importProgressFill.classList.remove('is-complete');
      dom.importProgressbar.setAttribute('aria-valuenow', '0');
      dom.importProgressbar.setAttribute('aria-valuemax', String(total));

      dom.importStatCompleted.innerHTML = `0 <span class="import-stat-total">/ ${total}</span>`;
      dom.importStatCompletedSub.textContent = '0% done';
      dom.importStatRemaining.textContent = String(total);
      dom.importStatRemainingSub.textContent = `${total} books left`;
      dom.importStatEta.textContent = 'Calculating...';
      dom.importStatEtaSub.textContent = 'estimated';

      dom.importCurrentTitle.textContent = 'Preparing backup payload...';
      dom.importCurrentTitle.title = 'Preparing backup payload...';
      dom.importCurrentItemBox.style.display = 'flex';

      dom.importCompleteSummary.hidden = true;
      dom.importProgressDoneBtn.style.display = 'none';

      dom.importTimerBadge.classList.remove('is-complete');
      dom.importProgressIconBox.classList.remove('is-complete');
      dom.importProgressSpinnerIcon.hidden = false;
      dom.importProgressSuccessIcon.hidden = true;
      dom.importRunningTime.textContent = '00:00.0';

      document.addEventListener('keydown', handleModalKeyDown);
    }

    // Start live running stopwatch timer
    const startTime = performance.now();
    if (importTimerInterval) clearInterval(importTimerInterval);
    importTimerInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      if (dom.importRunningTime) {
        dom.importRunningTime.textContent = formatElapsedTime(elapsed);
      }
    }, 60);

    let importedCount = 0;
    let skippedCount = 0;
    const importedBooks = [];
    const existingTitlesAuthors = new Set(
      mode === 'merge' ? books.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`) : []
    );

    // Blazing-fast batching:
    // Update the progress bar smoothly ~40-60 times total so even 10,000+ books finish in ~1 to 2 seconds!
    const targetSteps = Math.min(60, Math.max(10, Math.ceil(total / 10)));
    const batchSize = Math.max(1, Math.ceil(total / targetSteps));

    let processed = 0;

    for (let i = 0; i < total; i++) {
      const rawItem = rawList[i];
      processed++;

      // Book limit check
      if (importedBooks.length + (mode === 'merge' ? books.length : 0) >= MAX_BOOKS_LIMIT) {
        skippedCount++;
        continue;
      }

      // Type check
      if (!rawItem || typeof rawItem !== 'object') {
        skippedCount++;
        continue;
      }

      const title = normalizeText(rawItem.title);
      const author = normalizeText(rawItem.author);
      let status = 'to-read';
      if (rawItem.status === 'reading' || rawItem.status === 'Reading') status = 'reading';
      else if (rawItem.status === 'finished' || rawItem.status === 'Finished') status = 'finished';

      // Text validation checks
      if (
        !title ||
        title.length > MAX_TITLE_LENGTH ||
        !ALPHANUMERIC_REGEX.test(title) ||
        !author ||
        author.length > MAX_AUTHOR_LENGTH ||
        !ALPHANUMERIC_REGEX.test(author)
      ) {
        skippedCount++;
        continue;
      }

      // Duplicate check
      const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
      if (existingTitlesAuthors.has(key)) {
        skippedCount++;
        continue;
      }
      existingTitlesAuthors.add(key);

      // Fast image conversion if present
      let processedThumbnailBlob = null;
      if (
        typeof rawItem.thumbnailDataUrl === 'string' &&
        rawItem.thumbnailDataUrl.startsWith('data:image/')
      ) {
        processedThumbnailBlob = fastDataUrlToBlob(rawItem.thumbnailDataUrl);
      }

      importedBooks.push({
        id: generateId(),
        title,
        author,
        status,
        createdAt: typeof rawItem.createdAt === 'number' ? rawItem.createdAt : Date.now(),
        thumbnailBlob: processedThumbnailBlob
      });
      importedCount++;

      // Batch UI updates and yield so the UI is responsive and animations are silky smooth
      if (processed % batchSize === 0 || processed === total) {
        const remaining = total - processed;
        const percent = Math.min(100, Math.round((processed / total) * 100));
        const rawBookTitle = rawItem && typeof rawItem.title === 'string' ? normalizeText(rawItem.title) : `Book #${processed}`;

        if (dom.importCurrentTitle) {
          dom.importCurrentTitle.textContent = rawBookTitle || `Book #${processed}`;
          dom.importCurrentTitle.title = rawBookTitle || `Book #${processed}`;
        }
        if (dom.importPercentText) dom.importPercentText.textContent = `${percent}%`;
        if (dom.importProgressFill) dom.importProgressFill.style.width = `${percent}%`;
        if (dom.importProgressbar) dom.importProgressbar.setAttribute('aria-valuenow', String(percent));
        if (dom.importStatCompleted) {
          dom.importStatCompleted.innerHTML = `${processed} <span class="import-stat-total">/ ${total}</span>`;
        }
        if (dom.importStatCompletedSub) dom.importStatCompletedSub.textContent = `${percent}% done`;
        if (dom.importStatRemaining) dom.importStatRemaining.textContent = String(remaining);
        if (dom.importStatRemainingSub) {
          dom.importStatRemainingSub.textContent = remaining === 1 ? '1 book left' : `${remaining} books left`;
        }

        const elapsedSoFar = performance.now() - startTime;
        if (processed >= 2 && remaining > 0) {
          const msPerBook = elapsedSoFar / processed;
          const remainingMs = remaining * msPerBook;
          if (dom.importStatEta) dom.importStatEta.textContent = formatEtaTime(remainingMs);
        } else if (remaining === 0) {
          if (dom.importStatEta) dom.importStatEta.textContent = 'Saving...';
        }

        // Fast yield to browser animation frame
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    // Atomic High-Speed IndexedDB Transaction
    if (dom.importStatusText) dom.importStatusText.textContent = 'Writing books to database...';
    if (dom.importCurrentTitle) dom.importCurrentTitle.textContent = 'Committing changes to IndexedDB...';

    if (db && !inMemoryFallback) {
      try {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        if (mode === 'replace') {
          await tx.store.clear();
        }
        // Bulk queue without sequential await ticks for instant write!
        for (let i = 0; i < importedBooks.length; i++) {
          tx.store.put(importedBooks[i]);
        }
        await tx.done;

        if (mode === 'replace') {
          books = importedBooks;
        } else {
          books = [...importedBooks, ...books];
        }
      } catch (err) {
        console.error('[READLOG] Atomic import transaction failed:', err);
        clearInterval(importTimerInterval);
        importTimerInterval = null;
        isImportInProgress = false;
        if (dom.importStatusText) dom.importStatusText.textContent = 'Import transaction failed.';
        if (dom.importProgressDoneBtn) {
          dom.importProgressDoneBtn.style.display = 'inline-flex';
          dom.importProgressDoneBtn.textContent = 'Close';
        }
        showToast('Import transaction failed. Existing shelf was preserved.', 'error');
        return;
      }
    } else {
      if (mode === 'replace') {
        books = importedBooks;
      } else {
        books = [...importedBooks, ...books];
      }
    }

    // Finished successfully!
    clearInterval(importTimerInterval);
    importTimerInterval = null;
    isImportInProgress = false;

    const totalDurationMs = performance.now() - startTime;
    const finalFormattedTime = formatElapsedTime(totalDurationMs);

    // Update DOM to Complete State
    if (dom.importProgressModal) {
      dom.importRunningTime.textContent = finalFormattedTime;
      dom.importTimerBadge.classList.add('is-complete');
      dom.importProgressIconBox.classList.add('is-complete');
      dom.importProgressSpinnerIcon.hidden = true;
      dom.importProgressSuccessIcon.hidden = false;

      dom.importProgressTitle.textContent = 'Backup Restored Successfully!';
      dom.importProgressSubtitle.textContent = mode === 'replace' ? 'Your shelf was replaced with the backup.' : 'Backup books were merged with your shelf.';
      dom.importStatusText.textContent = 'Restore finished!';
      dom.importPercentText.textContent = '100%';
      dom.importProgressFill.style.width = '100%';
      dom.importProgressFill.classList.add('is-complete');
      dom.importProgressbar.setAttribute('aria-valuenow', '100');

      dom.importStatCompleted.innerHTML = `${total} <span class="import-stat-total">/ ${total}</span>`;
      dom.importStatCompletedSub.textContent = '100% complete';
      dom.importStatRemaining.textContent = '0';
      dom.importStatRemainingSub.textContent = 'Finished';
      dom.importStatEta.textContent = 'Done!';
      dom.importStatEtaSub.textContent = `Took ${finalFormattedTime}`;

      dom.importCurrentItemBox.style.display = 'none';

      dom.importSummaryImported.textContent = `${importedCount} book${importedCount === 1 ? '' : 's'} added`;
      dom.importSummarySkipped.textContent = `${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} or invalid skipped`;
      dom.importSummaryTime.textContent = `Completed in ${finalFormattedTime}`;
      dom.importCompleteSummary.hidden = false;

      dom.importProgressDoneBtn.style.display = 'inline-flex';
      dom.importProgressDoneBtn.textContent = 'Done & View Shelf';
      dom.importProgressDoneBtn.focus();
    }

    renderStats();
    renderBooks();
    showToast(`Successfully imported ${importedCount} books (${finalFormattedTime})`, 'success');
  }

  // --- Accessible Custom Dropdown Controller ---
  function setupCustomSelect({
    triggerEl,
    currentWrapEl,
    dropdownEl,
    nativeSelectEl,
    onChange
  }) {
    if (!triggerEl || !dropdownEl || !nativeSelectEl) return null;

    const options = Array.from(dropdownEl.querySelectorAll('.custom-dropdown-option'));

    function updateDisplay(value) {
      const matchOpt = options.find((opt) => opt.getAttribute('data-value') === value) || options[0];
      if (!matchOpt) return;

      const titleEl = matchOpt.querySelector('.option-title');
      const title = titleEl ? titleEl.textContent : (value === 'to-read' ? 'To read' : value === 'reading' ? 'Reading' : 'Finished');
      let dotClass = 'dot-to-read';
      if (value === 'reading') dotClass = 'dot-reading';
      else if (value === 'finished') dotClass = 'dot-finished';

      if (currentWrapEl) {
        currentWrapEl.innerHTML = `
          <span class="status-indicator-dot ${dotClass}" aria-hidden="true"></span>
          <span class="custom-select-label">${escapeHtml(title)}</span>
        `;
      }

      options.forEach((opt) => {
        const isMatch = opt.getAttribute('data-value') === value;
        opt.classList.toggle('is-active', isMatch);
        opt.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });
    }

    function openDropdown() {
      dropdownEl.hidden = false;
      triggerEl.setAttribute('aria-expanded', 'true');
      triggerEl.classList.add('is-open');

      const activeOpt = options.find((o) => o.classList.contains('is-active')) || options[0];
      if (activeOpt) {
        setTimeout(() => activeOpt.focus(), 20);
      }
    }

    function closeDropdown(returnFocusToTrigger = false) {
      dropdownEl.hidden = true;
      triggerEl.setAttribute('aria-expanded', 'false');
      triggerEl.classList.remove('is-open');
      if (returnFocusToTrigger && typeof triggerEl.focus === 'function') {
        triggerEl.focus();
      }
    }

    function selectValue(value, triggerChange = true) {
      nativeSelectEl.value = value;
      updateDisplay(value);
      closeDropdown(true);

      if (triggerChange) {
        const evt = new Event('change', { bubbles: true });
        nativeSelectEl.dispatchEvent(evt);
        if (typeof onChange === 'function') {
          onChange(value);
        }
      }
    }

    // Trigger button events
    triggerEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropdownEl.hidden) {
        // Close other custom dropdowns
        document.querySelectorAll('.custom-dropdown-panel:not([hidden])').forEach((panel) => {
          panel.hidden = true;
          const trg = panel.parentElement ? panel.parentElement.querySelector('.custom-select-trigger') : null;
          if (trg) {
            trg.setAttribute('aria-expanded', 'false');
            trg.classList.remove('is-open');
          }
        });
        openDropdown();
      } else {
        closeDropdown(false);
      }
    });

    triggerEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        openDropdown();
      }
    });

    // Options click and keyboard navigation
    options.forEach((opt, idx) => {
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = opt.getAttribute('data-value');
        selectValue(val);
      });

      opt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const val = opt.getAttribute('data-value');
          selectValue(val);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = (idx + 1) % options.length;
          options[nextIdx].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIdx = (idx - 1 + options.length) % options.length;
          options[prevIdx].focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeDropdown(true);
        } else if (e.key === 'Tab') {
          closeDropdown(false);
        }
      });
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!dropdownEl.hidden && !triggerEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        closeDropdown(false);
      }
    });

    // Sync on native select changes
    nativeSelectEl.addEventListener('change', () => {
      updateDisplay(nativeSelectEl.value);
    });

    // Initial state
    updateDisplay(nativeSelectEl.value || DEFAULT_STATUS);

    return {
      setValue(val, triggerChange = false) {
        selectValue(val, triggerChange);
      },
      refresh() {
        updateDisplay(nativeSelectEl.value);
      }
    };
  }

  // --- Event Listeners Setup ---
  function initEventListeners() {
    // Add Book Form Custom Select
    addCustomSelect = setupCustomSelect({
      triggerEl: dom.customStatusTrigger,
      currentWrapEl: dom.customStatusCurrent,
      dropdownEl: dom.customStatusDropdown,
      nativeSelectEl: dom.bookStatusSelect
    });

    // Edit Modal Custom Select
    editCustomSelect = setupCustomSelect({
      triggerEl: dom.editCustomStatusTrigger,
      currentWrapEl: dom.editCustomStatusCurrent,
      dropdownEl: dom.editCustomStatusDropdown,
      nativeSelectEl: dom.editBookStatus
    });

    // Add Book Form
    dom.addBookForm.addEventListener('submit', handleAddBookSubmit);

    // Live Character Counters
    dom.bookTitleInput.addEventListener('input', () => {
      updateCharCounter(dom.bookTitleInput, dom.titleCharCount, MAX_TITLE_LENGTH);
      if (dom.bookTitleInput.value.trim().length > 0) {
        dom.titleError.textContent = '';
        dom.bookTitleInput.classList.remove('is-invalid');
      }
    });

    dom.bookAuthorInput.addEventListener('input', () => {
      updateCharCounter(dom.bookAuthorInput, dom.authorCharCount, MAX_AUTHOR_LENGTH);
      if (dom.bookAuthorInput.value.trim().length > 0) {
        dom.authorError.textContent = '';
        dom.bookAuthorInput.classList.remove('is-invalid');
      }
    });

    // Dropzone Click & Keyboard Accessible Trigger
    dom.thumbnailDropzone.addEventListener('click', (e) => {
      // Don't trigger if clicked on Change or Remove buttons (they handle their own actions)
      if (e.target.closest('#remove-thumbnail-btn') || e.target.closest('#change-thumbnail-btn')) {
        return;
      }
      // If preview card is showing, clicking the preview cover opens picker to replace
      if (dom.thumbnailPreviewCard && !dom.thumbnailPreviewCard.hidden) {
        if (e.target.closest('.preview-thumbnail-wrap')) {
          dom.bookThumbnailInput.click();
        }
        return;
      }
      // When empty state, clicking the dropzone opens file picker
      dom.bookThumbnailInput.click();
    });

    dom.thumbnailDropzone.addEventListener('keydown', (e) => {
      // If active focus is on an internal button, let that button process Enter/Space natively
      if (document.activeElement && document.activeElement !== dom.thumbnailDropzone) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dom.bookThumbnailInput.click();
      }
    });

    if (dom.changeThumbnailBtn) {
      dom.changeThumbnailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.bookThumbnailInput.click();
      });
    }

    if (dom.removeThumbnailBtn) {
      dom.removeThumbnailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeThumbnail();
        dom.thumbnailDropzone.focus();
      });
    }

    dom.bookThumbnailInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleThumbnailFileSelected(files[0]);
      }
    });

    // Drag & Drop Handlers with Visual Feedback & dragCounter
    let dragCounter = 0;

    dom.thumbnailDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dom.thumbnailDropzone.classList.add('is-dragover');
      if (dom.dropzonePrompt) dom.dropzonePrompt.hidden = true;
      if (dom.thumbnailPreviewCard) dom.thumbnailPreviewCard.hidden = true;
      if (dom.dropzoneDragoverPrompt) dom.dropzoneDragoverPrompt.hidden = false;
    });

    dom.thumbnailDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!dom.thumbnailDropzone.classList.contains('is-dragover')) {
        dom.thumbnailDropzone.classList.add('is-dragover');
      }
    });

    dom.thumbnailDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dom.thumbnailDropzone.classList.remove('is-dragover');
        if (dom.dropzoneDragoverPrompt) dom.dropzoneDragoverPrompt.hidden = true;
        if (currentThumbnailBlob) {
          if (dom.thumbnailPreviewCard) dom.thumbnailPreviewCard.hidden = false;
          if (dom.dropzonePrompt) dom.dropzonePrompt.hidden = true;
        } else {
          if (dom.dropzonePrompt) dom.dropzonePrompt.hidden = false;
        }
      }
    });

    dom.thumbnailDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dom.thumbnailDropzone.classList.remove('is-dragover');
      if (dom.dropzoneDragoverPrompt) dom.dropzoneDragoverPrompt.hidden = true;
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        if (files.length > 1) {
          dom.thumbnailNotice.textContent = 'Multiple files dropped. Using the first image.';
        }
        handleThumbnailFileSelected(files[0]);
      } else {
        if (currentThumbnailBlob) {
          if (dom.thumbnailPreviewCard) dom.thumbnailPreviewCard.hidden = false;
        } else {
          if (dom.dropzonePrompt) dom.dropzonePrompt.hidden = false;
        }
      }
    });

    // High-Performance Debounced Search Controls (Silky smooth with 5,000+ records)
    let searchDebounceTimer = null;

    dom.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      const hasQuery = searchQuery.trim().length > 0;
      dom.clearSearchBtn.hidden = !hasQuery;

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        renderBooks();
      }, 100);
    });

    dom.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.searchInput.value) {
        e.preventDefault();
        clearTimeout(searchDebounceTimer);
        searchQuery = '';
        dom.searchInput.value = '';
        dom.clearSearchBtn.hidden = true;
        renderBooks();
      }
    });

    dom.clearSearchBtn.addEventListener('click', () => {
      clearTimeout(searchDebounceTimer);
      searchQuery = '';
      dom.searchInput.value = '';
      dom.clearSearchBtn.hidden = true;
      renderBooks();
      dom.searchInput.focus();
    });

    dom.resetSearchBtn.addEventListener('click', () => {
      clearTimeout(searchDebounceTimer);
      searchQuery = '';
      dom.searchInput.value = '';
      dom.clearSearchBtn.hidden = true;
      renderBooks();
      dom.searchInput.focus();
    });

    // Edit Modal Events
    dom.editBookForm.addEventListener('submit', handleEditFormSubmit);
    dom.cancelEditBtn.addEventListener('click', closeEditModal);
    dom.cancelEditX.addEventListener('click', closeEditModal);

    dom.editBookTitle.addEventListener('input', () => {
      updateCharCounter(dom.editBookTitle, dom.editTitleCharCount, MAX_TITLE_LENGTH);
      dom.editTitleError.textContent = '';
    });

    dom.editBookAuthor.addEventListener('input', () => {
      updateCharCounter(dom.editBookAuthor, dom.editAuthorCharCount, MAX_AUTHOR_LENGTH);
      dom.editAuthorError.textContent = '';
    });

    dom.editChangeThumbBtn.addEventListener('click', () => {
      dom.editThumbnailInput.click();
    });

    dom.editThumbnailInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        dom.editThumbnailError.textContent = '';
        const res = await validateAndProcessImage(files[0]);
        if (!res.success) {
          dom.editThumbnailError.textContent = res.error;
          return;
        }

        editThumbnailBlob = res.blob;
        editRemoveCoverFlag = false;

        if (editPreviewUrl) revokeTrackedUrl(editPreviewUrl);
        editPreviewUrl = trackObjectUrl(URL.createObjectURL(editThumbnailBlob));
        dom.editThumbPreviewImg.src = editPreviewUrl;
        dom.editThumbPreviewImg.hidden = false;
        dom.editThumbPlaceholder.hidden = true;
        dom.editRemoveThumbBtn.hidden = false;
      }
    });

    dom.editRemoveThumbBtn.addEventListener('click', () => {
      editThumbnailBlob = null;
      editRemoveCoverFlag = true;
      if (editPreviewUrl) revokeTrackedUrl(editPreviewUrl);
      editPreviewUrl = null;
      dom.editThumbPreviewImg.hidden = true;
      dom.editThumbPlaceholder.hidden = false;
      dom.editRemoveThumbBtn.hidden = true;
    });

    // Delete Modal Events
    dom.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    dom.cancelDeleteX.addEventListener('click', closeDeleteModal);
    dom.confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Bulk Selection Events
    if (dom.selectAllCheckbox) {
      dom.selectAllCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectAllVisible();
        } else {
          deselectAll();
        }
      });
    }

    if (dom.bulkDeselectBtn) {
      dom.bulkDeselectBtn.addEventListener('click', deselectAll);
    }

    if (dom.bulkDeleteBtn) {
      dom.bulkDeleteBtn.addEventListener('click', bulkDeleteSelected);
    }

    document.querySelectorAll('.bulk-status-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const status = btn.getAttribute('data-bulk-status');
        if (status) bulkSetStatus(status);
      });
    });

    // Backup Export & Import Events
    dom.exportBackupBtn.addEventListener('click', exportBackup);
    dom.importBackupBtn.addEventListener('click', () => {
      dom.backupFileInput.click();
    });
    dom.backupFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleBackupFileSelected(e.target.files[0]);
      }
    });

    // Import Modal Options
    dom.cancelImportBtn.addEventListener('click', closeImportModal);
    dom.cancelImportX.addEventListener('click', closeImportModal);
    dom.importMergeBtn.addEventListener('click', () => executeImport('merge'));
    dom.importReplaceBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to replace your entire shelf? All current books will be replaced with the backup.')) {
        executeImport('replace');
      }
    });

    // Import Progress Modal Done Action
    if (dom.importProgressDoneBtn) {
      dom.importProgressDoneBtn.addEventListener('click', closeImportProgressModal);
    }

    // Alert Dismissal
    if (dom.storageAlertDismiss) {
      dom.storageAlertDismiss.addEventListener('click', hideStorageAlert);
    }

    // Modal Background Scroll Lock: MutationObserver to keep background scroll lock in sync
    if (typeof MutationObserver === 'function') {
      const modalObserver = new MutationObserver(() => {
        syncScrollLock();
      });
      [dom.deleteModal, dom.editModal, dom.importModal, dom.importProgressModal].forEach((modalEl) => {
        if (modalEl) {
          modalObserver.observe(modalEl, { attributes: true, attributeFilter: ['hidden'] });
        }
      });
    }

    // Prevent background touch scrolling through modal backdrops on mobile
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('touchmove', (e) => {
        if (e.target === backdrop) {
          e.preventDefault();
        }
      }, { passive: false });
    });

    // Close modals when clicking the backdrop outside the dialog
    [
      { el: dom.deleteModal, close: closeDeleteModal },
      { el: dom.editModal, close: closeEditModal },
      { el: dom.importModal, close: closeImportModal },
      { el: dom.importProgressModal, close: () => { if (!isImportInProgress) closeImportProgressModal(); } }
    ].forEach(({ el, close }) => {
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) {
            close();
          }
        });
      }
    });
  }

  // --- Application Bootstrap ---
  async function init() {
    await initDatabase();
    initEventListeners();
    renderStats();
    renderBooks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
