/**
 * READLOG — Personal Reading Shelf
 * Pure Vanilla JavaScript implementation adhering to modern DOM standards,
 * full keyboard accessibility, zero dependencies, and robust local persistence.
 */

(function () {
  'use strict';

  // --- Constants & Configuration ---
  const STORAGE_KEY = 'bookTrackerBooks';
  const ALLOWED_STATUSES = Object.freeze(['To read', 'Reading', 'Finished']);
  const DEFAULT_STATUS = 'To read';

  // --- Application State ---
  let books = [];
  let searchQuery = '';
  let pendingDeleteId = null;
  let lastActiveElementBeforeModal = null;

  // --- DOM Elements Cache ---
  const dom = {
    // Stats
    statTotal: document.getElementById('stat-total'),
    statToRead: document.getElementById('stat-to-read'),
    statReading: document.getElementById('stat-reading'),
    statFinished: document.getElementById('stat-finished'),

    // Storage Alert
    storageAlert: document.getElementById('storage-alert'),
    storageAlertTitle: document.getElementById('storage-alert-title'),
    storageAlertText: document.getElementById('storage-alert-text'),
    storageAlertDismiss: document.getElementById('storage-alert-dismiss'),

    // Form
    addBookForm: document.getElementById('add-book-form'),
    bookTitleInput: document.getElementById('book-title'),
    bookAuthorInput: document.getElementById('book-author'),
    bookStatusSelect: document.getElementById('book-status'),
    titleError: document.getElementById('title-error'),
    authorError: document.getElementById('author-error'),

    // Shelf & Search
    shelfCountBadge: document.getElementById('shelf-count-badge'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    resetSearchBtn: document.getElementById('reset-search-btn'),
    bookGrid: document.getElementById('book-grid'),
    emptyShelfState: document.getElementById('empty-shelf-state'),
    noResultsState: document.getElementById('no-results-state'),
    noResultsQuery: document.getElementById('no-results-query'),

    // Delete Confirmation Modal
    deleteModal: document.getElementById('delete-modal'),
    deleteBookName: document.getElementById('delete-book-name'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
    cancelDeleteX: document.getElementById('cancel-delete-x'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn')
  };

  // --- Helper: Stable Unique ID Generator ---
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch (e) {
        // Fallback if randomUUID fails in restricted environments
      }
    }
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `book-${timestamp}-${randomPart}`;
  }

  // --- Helper: Storage Availability Check ---
  function isStorageAvailable() {
    try {
      const testKey = '__readlog_storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Storage: Load Books ---
  function loadBooks() {
    if (!isStorageAvailable()) {
      showStorageAlert(
        'Storage Unavailable',
        'Local storage is disabled or unsupported in this browser mode. Changes will persist only during your current session.'
      );
      return [];
    }

    const rawData = window.localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawData);
      if (!Array.isArray(parsed)) {
        showStorageAlert(
          'Corrupted Storage Data',
          'Stored reading data had an unexpected structure. Your existing storage was retained, but starting with a clean session.'
        );
        return [];
      }

      // Strict validation of each loaded record
      const validBooks = [];
      let hasInvalidEntries = false;

      parsed.forEach((item) => {
        if (
          item &&
          typeof item === 'object' &&
          typeof item.title === 'string' &&
          item.title.trim().length > 0 &&
          typeof item.author === 'string' &&
          item.author.trim().length > 0
        ) {
          const validatedStatus = ALLOWED_STATUSES.includes(item.status)
            ? item.status
            : DEFAULT_STATUS;
          const validatedTimestamp =
            typeof item.createdAt === 'number' && !isNaN(item.createdAt)
              ? item.createdAt
              : Date.now();
          const validatedId = typeof item.id === 'string' && item.id.length > 0
            ? item.id
            : generateId();

          validBooks.push({
            id: validatedId,
            title: item.title.trim(),
            author: item.author.trim(),
            status: validatedStatus,
            createdAt: validatedTimestamp
          });
        } else {
          hasInvalidEntries = true;
        }
      });

      if (hasInvalidEntries) {
        showStorageAlert(
          'Data Recovery Notice',
          'Some malformed book entries were safely skipped during data recovery.'
        );
      }

      return validBooks;
    } catch (err) {
      console.error('[READLOG] JSON Parse Error in loadBooks:', err);
      showStorageAlert(
        'Storage Parse Error',
        'Could not parse saved books from local storage. Your original storage key was not overwritten.'
      );
      return [];
    }
  }

  // --- Storage: Save Books ---
  function saveBooks() {
    if (!isStorageAvailable()) {
      return false;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
      return true;
    } catch (err) {
      console.error('[READLOG] LocalStorage write error:', err);
      showStorageAlert(
        'Storage Full or Restricted',
        'Could not save changes to browser storage. Your quota might be exceeded.'
      );
      return false;
    }
  }

  // --- UI Alert Banner Display ---
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

  // --- Statistics Calculation & Rendering ---
  function renderStats() {
    const total = books.length;
    let toReadCount = 0;
    let readingCount = 0;
    let finishedCount = 0;

    for (let i = 0; i < total; i++) {
      const status = books[i].status;
      if (status === 'To read') toReadCount++;
      else if (status === 'Reading') readingCount++;
      else if (status === 'Finished') finishedCount++;
    }

    dom.statTotal.textContent = String(total);
    dom.statToRead.textContent = String(toReadCount);
    dom.statReading.textContent = String(readingCount);
    dom.statFinished.textContent = String(finishedCount);
  }

  // --- Search & Filter Logic ---
  function getFilteredBooks() {
    const query = searchQuery.trim().toLowerCase();
    
    // Sort newest first by creation timestamp, tie-breaking by ID
    const sorted = [...books].sort((a, b) => {
      if (b.createdAt !== a.createdAt) {
        return b.createdAt - a.createdAt;
      }
      return String(b.id).localeCompare(String(a.id));
    });

    if (!query) {
      return sorted;
    }

    return sorted.filter((book) => {
      const titleMatch = book.title.toLowerCase().includes(query);
      const authorMatch = book.author.toLowerCase().includes(query);
      return titleMatch || authorMatch;
    });
  }

  // --- Helper: Format Relative Time or Date ---
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

  // --- Safe Card DOM Builder (Zero Unsafe innerHTML) ---
  function createBookCardElement(book) {
    const article = document.createElement('article');
    article.className = 'book-card';
    article.setAttribute('data-id', book.id);
    article.setAttribute('data-status', book.status);

    // Card Top: Status Badge
    const cardTop = document.createElement('div');
    cardTop.className = 'card-top';

    const statusBadge = document.createElement('span');
    const statusClassSlug = book.status.toLowerCase().replace(/\s+/g, '-');
    statusBadge.className = `status-badge status-${statusClassSlug}`;

    const statusDot = document.createElement('span');
    statusDot.className = 'status-dot';
    statusDot.setAttribute('aria-hidden', 'true');

    const statusTextNode = document.createTextNode(book.status);
    statusBadge.appendChild(statusDot);
    statusBadge.appendChild(statusTextNode);
    cardTop.appendChild(statusBadge);

    // Card Body: Title & Author
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const titleH3 = document.createElement('h3');
    titleH3.className = 'book-title';
    titleH3.textContent = book.title;

    const authorP = document.createElement('p');
    authorP.className = 'book-author';
    const authorPrefix = document.createTextNode('by ');
    const authorStrong = document.createElement('span');
    authorStrong.textContent = book.author;
    authorP.appendChild(authorPrefix);
    authorP.appendChild(authorStrong);

    const metaP = document.createElement('p');
    metaP.className = 'card-meta';
    const formattedDate = formatAddedDate(book.createdAt);
    if (formattedDate) {
      metaP.textContent = `Added ${formattedDate}`;
    }

    cardBody.appendChild(titleH3);
    cardBody.appendChild(authorP);
    if (formattedDate) {
      cardBody.appendChild(metaP);
    }

    // Card Footer: Status Selector & Delete Button
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer';

    // Status Select
    const statusControlWrapper = document.createElement('div');
    statusControlWrapper.className = 'card-status-control';

    const statusSelect = document.createElement('select');
    statusSelect.className = 'card-status-select';
    statusSelect.setAttribute('aria-label', `Change reading status for "${book.title}"`);

    ALLOWED_STATUSES.forEach((statusOption) => {
      const option = document.createElement('option');
      option.value = statusOption;
      option.textContent = statusOption;
      if (statusOption === book.status) {
        option.selected = true;
      }
      statusSelect.appendChild(option);
    });

    statusSelect.addEventListener('change', (e) => {
      handleStatusChange(book.id, e.target.value);
    });

    const statusArrow = document.createElement('div');
    statusArrow.className = 'card-status-arrow';
    statusArrow.setAttribute('aria-hidden', 'true');
    statusArrow.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    statusControlWrapper.appendChild(statusSelect);
    statusControlWrapper.appendChild(statusArrow);

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-card-delete';
    deleteBtn.setAttribute('aria-label', `Delete "${book.title}" by ${book.author}`);
    deleteBtn.title = `Delete "${book.title}"`;
    deleteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;

    deleteBtn.addEventListener('click', () => {
      openDeleteModal(book.id, book.title, deleteBtn);
    });

    cardFooter.appendChild(statusControlWrapper);
    cardFooter.appendChild(deleteBtn);

    // Assemble Card
    article.appendChild(cardTop);
    article.appendChild(cardBody);
    article.appendChild(cardFooter);

    return article;
  }

  // --- Render Book Shelf View ---
  function renderBooks() {
    const filtered = getFilteredBooks();
    const totalCount = books.length;
    const queryActive = searchQuery.trim().length > 0;

    // Shelf badge updates
    if (queryActive) {
      dom.shelfCountBadge.textContent = `${filtered.length} of ${totalCount} ${totalCount === 1 ? 'book' : 'books'}`;
    } else {
      dom.shelfCountBadge.textContent = `${totalCount} ${totalCount === 1 ? 'book' : 'books'}`;
    }

    // Toggle clear search button visibility
    dom.clearSearchBtn.hidden = !queryActive;

    // View State Handling:
    // Case 1: Shelf is totally empty
    if (totalCount === 0) {
      dom.bookGrid.hidden = true;
      dom.bookGrid.innerHTML = '';
      dom.noResultsState.hidden = true;
      dom.emptyShelfState.hidden = false;
      return;
    }

    // Case 2: Shelf has books, but search filter yielded zero matches
    if (queryActive && filtered.length === 0) {
      dom.bookGrid.hidden = true;
      dom.bookGrid.innerHTML = '';
      dom.emptyShelfState.hidden = true;
      dom.noResultsQuery.textContent = searchQuery.trim();
      dom.noResultsState.hidden = false;
      return;
    }

    // Case 3: Display matching book cards
    dom.emptyShelfState.hidden = true;
    dom.noResultsState.hidden = true;
    dom.bookGrid.hidden = false;

    // Clean DOM replacement
    dom.bookGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    filtered.forEach((book) => {
      const cardElement = createBookCardElement(book);
      fragment.appendChild(cardElement);
    });

    dom.bookGrid.appendChild(fragment);
  }

  // --- Form Validation & Submission ---
  function validateForm(title, author) {
    let isValid = true;
    let firstInvalidInput = null;

    // Clear previous errors
    clearValidationErrors();

    if (!title || title.trim().length === 0) {
      dom.titleError.textContent = 'Book title is required.';
      dom.bookTitleInput.classList.add('is-invalid');
      isValid = false;
      if (!firstInvalidInput) firstInvalidInput = dom.bookTitleInput;
    }

    if (!author || author.trim().length === 0) {
      dom.authorError.textContent = 'Author name is required.';
      dom.bookAuthorInput.classList.add('is-invalid');
      isValid = false;
      if (!firstInvalidInput) firstInvalidInput = dom.bookAuthorInput;
    }

    return { isValid, firstInvalidInput };
  }

  function clearValidationErrors() {
    dom.titleError.textContent = '';
    dom.authorError.textContent = '';
    dom.bookTitleInput.classList.remove('is-invalid');
    dom.bookAuthorInput.classList.remove('is-invalid');
  }

  function handleAddBookSubmit(e) {
    e.preventDefault();

    const rawTitle = dom.bookTitleInput.value;
    const rawAuthor = dom.bookAuthorInput.value;
    const rawStatus = dom.bookStatusSelect.value;

    const { isValid, firstInvalidInput } = validateForm(rawTitle, rawAuthor);

    if (!isValid) {
      if (firstInvalidInput) {
        firstInvalidInput.focus();
      }
      return;
    }

    const trimmedTitle = rawTitle.trim();
    const trimmedAuthor = rawAuthor.trim();
    const validatedStatus = ALLOWED_STATUSES.includes(rawStatus)
      ? rawStatus
      : DEFAULT_STATUS;

    const newBook = {
      id: generateId(),
      title: trimmedTitle,
      author: trimmedAuthor,
      status: validatedStatus,
      createdAt: Date.now()
    };

    // Prepend to array so newest book is first
    books.unshift(newBook);
    saveBooks();

    // Reset Form Fields
    dom.bookTitleInput.value = '';
    dom.bookAuthorInput.value = '';
    dom.bookStatusSelect.value = DEFAULT_STATUS;
    clearValidationErrors();

    // Update Views
    renderStats();
    renderBooks();

    // Return focus gracefully to title input for smooth batch entry
    dom.bookTitleInput.focus();
  }

  // --- Status Change Handler ---
  function handleStatusChange(id, newStatus) {
    if (!ALLOWED_STATUSES.includes(newStatus)) {
      console.warn('[READLOG] Invalid status update attempted:', newStatus);
      return;
    }

    const targetIndex = books.findIndex((b) => b.id === id);
    if (targetIndex === -1) {
      console.warn('[READLOG] Book not found for status update:', id);
      return;
    }

    // Preserve creation timestamp and all other fields
    books[targetIndex].status = newStatus;
    saveBooks();

    // Re-render stats & shelf
    renderStats();
    renderBooks();
  }

  // --- Delete Modal & Action Handlers ---
  function openDeleteModal(bookId, bookTitle, triggerElement) {
    pendingDeleteId = bookId;
    lastActiveElementBeforeModal = triggerElement;
    dom.deleteBookName.textContent = `"${bookTitle}"`;
    dom.deleteModal.hidden = false;
    dom.cancelDeleteBtn.focus();
    document.addEventListener('keydown', handleModalKeyDown);
  }

  function closeDeleteModal() {
    dom.deleteModal.hidden = true;
    pendingDeleteId = null;
    document.removeEventListener('keydown', handleModalKeyDown);
    if (lastActiveElementBeforeModal && typeof lastActiveElementBeforeModal.focus === 'function') {
      lastActiveElementBeforeModal.focus();
    }
  }

  function handleModalKeyDown(e) {
    if (e.key === 'Escape') {
      closeDeleteModal();
    }
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;

    const initialLength = books.length;
    books = books.filter((b) => b.id !== pendingDeleteId);

    if (books.length < initialLength) {
      saveBooks();
      renderStats();
      renderBooks();
    }

    dom.deleteModal.hidden = true;
    pendingDeleteId = null;
    document.removeEventListener('keydown', handleModalKeyDown);

    // Focus either the search bar or the add book title input
    if (dom.searchInput && dom.searchInput.value) {
      dom.searchInput.focus();
    } else {
      dom.bookTitleInput.focus();
    }
  }

  // --- Search Event Handlers ---
  function handleSearchInput(e) {
    searchQuery = e.target.value;
    renderBooks();
  }

  function handleClearSearch() {
    searchQuery = '';
    dom.searchInput.value = '';
    dom.clearSearchBtn.hidden = true;
    renderBooks();
    dom.searchInput.focus();
  }

  // --- Real-time Inline Error Clearing ---
  function handleInputTouch(inputElement, errorElement) {
    if (inputElement.value.trim().length > 0) {
      errorElement.textContent = '';
      inputElement.classList.remove('is-invalid');
    }
  }

  // --- Initialize Event Listeners ---
  function initEventListeners() {
    // Add Book Form
    dom.addBookForm.addEventListener('submit', handleAddBookSubmit);

    // Dynamic error clearing when typing in form
    dom.bookTitleInput.addEventListener('input', () => {
      handleInputTouch(dom.bookTitleInput, dom.titleError);
    });
    dom.bookAuthorInput.addEventListener('input', () => {
      handleInputTouch(dom.bookAuthorInput, dom.authorError);
    });

    // Search Controls
    dom.searchInput.addEventListener('input', handleSearchInput);
    dom.clearSearchBtn.addEventListener('click', handleClearSearch);
    dom.resetSearchBtn.addEventListener('click', handleClearSearch);

    // Modal Controls
    dom.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    dom.cancelDeleteX.addEventListener('click', closeDeleteModal);
    dom.confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Close modal on backdrop click
    dom.deleteModal.addEventListener('click', (e) => {
      if (e.target === dom.deleteModal) {
        closeDeleteModal();
      }
    });

    // Storage Alert Dismissal
    if (dom.storageAlertDismiss) {
      dom.storageAlertDismiss.addEventListener('click', hideStorageAlert);
    }
  }

  // --- App Bootstrap ---
  function init() {
    books = loadBooks();
    initEventListeners();
    renderStats();
    renderBooks();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
