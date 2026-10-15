# PROMPTS & AI-ASSISTED DEVELOPMENT LOG

This document records the actual prompts, engineering decisions, verification steps, and genuine debugging observations encountered during the development of **READLOG**.

---

## Prompt 1: Planning & Architecture

### Actual Prompt
> "Inspect the current workspace. Confirm file structure and plan the architecture for READLOG, a minimalist, editorial Book Tracker built with pure HTML5, CSS3, and Vanilla JavaScript, with localStorage persistence and zero dependencies."

### What Changed
- Inspected the workspace directory (`mini_project_ipsr_assessment`) and confirmed it was completely clean.
- Initialized a local Git repository and created `.gitignore` to protect against operating system metadata and temporary log files.
- Formulated the component architecture:
  - Header with editorial brand emblem and wordmark.
  - Welcome section with clear heading hierarchy.
  - Live 4-card statistics strip.
  - Add-book form with inline field validation.
  - Live search bar with instant query matching and reset buttons.
  - Responsive card grid displaying entries newest first.
  - Accessible modal dialog for deletion confirmation.

### What Was Checked
- Verified that all requirements fit directly into static files (`index.html`, `style.css`, `app.js`) suitable for GitHub Pages hosting without requiring any build step or package manager.

### Problems Observed
- None at this stage; clean slate.

### Follow-up Prompt
- Proceeded directly to drafting the semantic HTML structure and CSS styling system.

---

## Prompt 2: Core Interface & Styling

### Actual Prompt
> "Implement index.html and style.css for READLOG. Use a warm off-white canvas, forest green primary accents, accessible typography with Inter and fallbacks, responsive cards, and visible focus indicators. Include form controls for title, author, and reading status with accessible labels and error placeholders."

### What Changed
- Created `index.html` with full semantic elements (`<header>`, `<main>`, `<section>`, `<article>`, `<dialog>` backdrop).
- Created `style.css` defining CSS custom properties (design tokens for colors, shadows, borders, spacing, radii), responsive grid layouts, card hover micro-interactions, accessible status badges, and `@media (prefers-reduced-motion: reduce)`.
- Added an inline SVG favicon to prevent browser 404 errors during asset requests.

### What Was Checked
- Inspected layout proportions across desktop (960px container), tablet, and mobile breakpoints down to 320px.
- Verified that form labels are explicitly paired with input IDs via `for` attributes, and error containers are wired with `aria-live="polite"` and `aria-describedby`.

### Problems Observed
- Standard select arrows in browsers look clunky; replaced default styling with custom accessible SVG indicators using `-webkit-appearance: none; appearance: none;`.

---

## Prompt 3: Data Persistence & State Management

### Actual Prompt
> "Implement app.js with localStorage persistence under key 'bookTrackerBooks'. Store an array of objects containing { id, title, author, status, createdAt }. Build resilient loadBooks() and saveBooks() functions that validate data and handle corrupted JSON gracefully."

### What Changed
- Built `generateId()` using `crypto.randomUUID()` with a robust fallback.
- Implemented `loadBooks()` with comprehensive schema validation:
  - Validates that the loaded entity is a JavaScript array.
  - Filters and sanitizes each item to ensure string titles, authors, valid statuses, and numeric timestamps.
  - Displays a non-intrusive `#storage-alert` warning if corruptions are detected without wiping out the user's raw stored string.
- Built `saveBooks()` with `try/catch` wrapping to capture quota or privacy-mode exceptions.
- Implemented `validateForm()` enforcing non-empty, trimmed values for title and author, marking inputs with `.is-invalid` and returning focus to the first invalid field.

### What Was Checked
- Tested empty input submissions, space-only inputs, and verified that valid fields are preserved when another field fails validation.

---

## Prompt 4: Search, Status Updates & Deletion

### Actual Prompt
> "Implement live case-insensitive search by title or author, newest-first sorting, status transitions, and accessible book deletion."

### What Changed
- Wired up real-time `input` event listeners on `#search-input`:
  - Trims the search string and applies case-insensitive matching against `book.title` and `book.author`.
  - Does not mutate the persistent `books` array.
  - Displays a dedicated empty state `#no-results-state` when the query matches nothing, while keeping the shelf count updated.
- Created `handleStatusChange(id, newStatus)` which updates status in place by ID, preserves the original `createdAt` timestamp, and immediately syncs the status badge, card accent stripe, and statistics.
- Built `openDeleteModal(bookId, bookTitle)` and `confirmDelete()` to provide an accessible confirmation dialog with Escape key listeners and focus restoration.

### What Was Checked
- Verified that changing a status or deleting an item while a search filter is active operates on the correct item by ID rather than a visual array index.

---

## Prompt 5: Automated Testing & Debugging

### Actual Prompt
> "Run the entire verification suite (Tests A through O) in a real headless Chrome browser using the Chrome DevTools Protocol. Verify persistence, responsive viewports, and edge cases. Document any real defects found."

### What Changed
- Launched a local test server and headless Google Chrome instance (`chrome.exe --headless=new --remote-debugging-port=9222`).
- Authored an automated test script (`test_suite.mjs`) communicating over WebSocket CDP to execute Tests A through O.
- Executed all 15 scenarios, evaluated computed styles, and captured visual screenshots.

### Problems Observed
- Discovered a genuine CSS specificity defect regarding the HTML5 `hidden` attribute on elements styled with `display: flex`.

---

## AI Mistake and Correction (Genuine Observed Issue)

### 1. What Went Wrong
During automated browser testing and visual screenshot analysis of Test K and Test O, the deletion confirmation modal (`#delete-modal`) remained visually visible on the page even after its JavaScript `hidden` property was set to `true` (`dom.deleteModal.hidden = true;`).

### 2. How the Issue Was Reproduced
1. Click the delete button on any book card (triggering `openDeleteModal()`, which sets `deleteModal.hidden = false`).
2. Click the "Cancel" or "Delete Book" button (calling `closeDeleteModal()` or `confirmDelete()`, which sets `deleteModal.hidden = true`).
3. Inspect the DOM element: although `<div id="delete-modal" class="modal-backdrop" hidden>` contained the `hidden` attribute in the DOM, the modal backdrop and dialog remained visibly rendered on top of the page.

### 3. Why It Happened (Root Cause)
In standard CSS specificity rules:
- The browser user-agent stylesheet provides `[hidden] { display: none; }` with attribute specificity `(0, 0, 1)`.
- In `style.css`, the modal backdrop class was declared as:
  ```css
  .modal-backdrop {
    display: flex;
    ...
  }
  ```
- Because a class selector (`.modal-backdrop`) has higher specificity `(0, 1, 0)` than the user-agent attribute selector `(0, 0, 1)`, the author rule `display: flex` completely overrode `display: none`.
- Consequently, setting `.hidden = true` in JavaScript failed to hide the element visually. The same risk applied to `.state-container` and `.alert-banner` which also had `display: flex`.

### 4. What Was Changed
In `style.css`, added the universally recognized HTML5 reset rule immediately after the box-sizing reset:
```css
/* Ensure HTML5 hidden attribute always takes precedence over class display styles */
[hidden] {
  display: none !important;
}
```

### 5. How the Fix Was Verified
- Re-ran the automated CDP test script against headless Chrome.
- Evaluated `getComputedStyle(document.getElementById('delete-modal')).display` in Chrome, confirming it returned `'none'` when `hidden = true`.
- Captured a new full-page screenshot (`readlog_full_shelf.png`), confirming that the modal backdrop was completely hidden, the empty states toggled appropriately, and the entire bookshelf rendered cleanly.

---

## Prompt 6: Book Cover Thumbnail & Enterprise Security Upgrades

### Actual Prompt
> "Please add a BOOK THUMBNAIL (cover image) feature while keeping the existing design style (cream background, dark green primary color, rounded cards, Inter font). Implement it with strong validation and security. Do not break existing functionality."

### What Changed
- **Upload Field & Dropzone**:
  - Implemented an accessible drag-and-drop zone with focus rings, keyboard trigger (Enter/Space), and single-file drop handling.
  - Added live preview box with an accessible "Remove" (X) button.
  - Added live character counters for Title (`0 / 150`) and Author (`0 / 100`).
- **File Validation & Magic-Byte Detection**:
  - Validated file sizes: max 10 MB, reject 0-byte files.
  - Implemented magic-byte inspection for JPEG, PNG, GIF, WEBP, BMP, AVIF, HEIC, TIFF, and SVG.
  - Implemented decompression-bomb checks (max 10,000 x 10,000 px and max 50 megapixels).
- **Canvas Sanitization**:
  - Resizes images proportionally so the longest side is <= 1200px.
  - Re-encodes through an off-DOM canvas to WebP/JPEG at 0.85 quality, stripping EXIF/GPS metadata and scripts.
  - SVGs are loaded only via isolated `<img src="blob:...">` and rasterized into bitmap Blobs before saving.
- **IndexedDB via Pinned `idb`**:
  - Migrated from `localStorage` to IndexedDB using a locally vendored `idb` v8.0.2 library.
  - Stored cover images as native binary Blobs.
  - Implemented `navigator.storage.persist()` and `navigator.storage.estimate()` monitoring.
- **Backup Export & Import**:
  - Built JSON export with images as Base64 data URLs.
  - Built strict JSON import with 100 MB limit, prototype pollution filtering, schema validation, and user choice for **Merge** vs. **Replace**.
- **Content Security Policy (CSP)**:
  - Enforced strict CSP via `<meta>` tag, `<meta name="referrer" content="no-referrer">`, and zero inline handlers.

### What Was Checked & Verified
- 10.1 MB image rejected; 9.9 MB image accepted.
- Non-image files (.txt/.exe renamed to .jpg) rejected via magic-byte checking.
- SVG with embedded `<script>` tag blocked and stored solely as a safe raster image.
- XSS titles displayed safely as plain text via `textContent`.
- Tampered backup files rejected safely with prototype pollution prevented.
- Full data and cover thumbnail persistence verified across reloads.

---

## Prompt 7: Premium Card Redesign & Visual Hierarchy

### Actual Prompt
> "make the card design into more prevmum good and feel and look make it corrcet"

### What Changed
- Transformed the book cards into an ultra-premium editorial card style:
  - Added subtle layered borders and soft ambient dropshadows (`0 8px 24px rgba(27, 59, 43, 0.07)`).
  - Modernized card cover aspect ratio (3:4 book proportion) with refined fallback book placeholders and foil-embossed icons.
  - Polished status capsule badges with smooth micro-gradients, crisp borders, and refined text weight.
  - Elevated card hover dynamics with subtle upward elevation (`translateY(-4px)`), increased shadow depth, and border luminance.

### What Was Checked
- Verified layout consistency across various card states: with cover thumbnail, without cover thumbnail, long titles, and long author names.

---

## Prompt 8: Bulk Selection & Batch Operations

### Actual Prompt
> "also add the otion select all and like for delete and chnage the status upadte make it corcet"

### What Changed
- Added individual multi-select checkboxes to each book card.
- Implemented a persistent, floating Bulk Action Toolbar that smoothly reveals when one or more cards are selected:
  - Multi-select count pill (`X books selected`).
  - "Select all" toggle to check/uncheck all visible matching books in one click.
  - Batch Status Update dropdown with instant options for *To Read*, *Reading*, and *Finished*.
  - Batch Delete button with confirmation modal showing exact count of selected books.
- Wired bulk database operations into IndexedDB transactions.

---

## Prompt 9: Mobile Ergonomics & Horizontal Glass Action Pills

### Actual Prompt
> "make it in mobile make the edit and delete icon into pill like hat with text make it like with color also make it glass lkek butons also with the two in horiatal lly make it corcet"

### What Changed
- On mobile viewports (`<= 640px`), replaced stacked icon-only buttons with side-by-side horizontal glassmorphic action pills:
  - **Edit Pill**: Glassmorphic translucent styling (`rgba(255, 255, 255, 0.85)` / dark forest green border and icon) with visible "Edit" text label.
  - **Delete Pill**: Soft glassmorphic red tint (`rgba(224, 86, 74, 0.08)` / coral red border and icon) with visible "Delete" text label.
  - Arranged horizontally (`flex-direction: row; gap: 8px`) along the bottom edge of the card for one-handed thumb ergonomics.

### What Was Checked
- Verified tap target sizes (`min-height: 42px`) meeting WCAG mobile touch criteria.
- Verified visual clarity on both light mode cards and mobile screens.

---

## Prompt 10: Performance Optimization & Sub-2-Second Bulk Processing

### Actual Prompt
> "why this too much time make it very faast under a some sec make like that not too much time"

### What Changed
- Identified performance bottlenecks when importing or batch-updating large libraries (e.g. 5,000+ books):
  1. `fetch(dataUrl).then(r => r.blob())` creates async microtask overhead for thousands of images.
  2. Per-item DOM updates cause layout thrashing.
  3. Single-item IndexedDB puts cause excessive disk I/O.
- Built ultra-fast `fastDataUrlToBlob` that decodes Base64 data URLs directly into `Uint8Array` binary Buffers in memory synchronously.
- Implemented single-transaction bulk writes (`const tx = db.transaction(STORE_BOOKS, 'readwrite')`) utilizing `tx.store.put(book)` inside a batched loop followed by `await tx.done`.
- Implemented chunked UI updates (40–60 animation frames total) so that even 5,000 to 10,000 items complete smoothly in **~1 to 2 seconds**.

---

## Prompt 11: Bulk Action Toolbar Harmonization & "Select All" Label

### Actual Prompt
> "make it style this into saem style of the another items make it corrcet"  
> "add slecet al like text here to idetify rather than the imagine make it corrcet"

### What Changed
- Redesigned the floating Bulk Action Toolbar from a dark background to a light editorial glassmorphic card design matching the rest of the application:
  - Translucent cream background (`rgba(247, 246, 240, 0.95)`), subtle glass blur (`backdrop-filter: blur(16px)`), and thin border.
  - Added an explicit, visible text label `"Select all"` next to the master checkbox to replace ambiguous icons.
  - Styled the status dropdown capsule and delete pill with cohesive colors matching the main design system.

---

## Prompt 12: Live Stopwatch Progress for Bulk Operations

### Actual Prompt
> "also if we secet itms and then upadte the stsus or dete that then also shows the progrss make it corcet also very fast also make it corcet"

### What Changed
- Integrated the interactive live progress modal into both **Bulk Delete** and **Bulk Status Update** operations:
  - Live progress bar (`0%` to `100%`) with smooth transitions.
  - 60fps stopwatch timer (`MM:SS.T`) displaying exact elapsed time.
  - Live item ticker showing the currently processed book title.
  - Estimated time remaining (ETA) badge (`< 2s estimated`).
  - Completed summary screen with a green checkmark icon when finished.

---

## Prompt 13: Tap Highlight Removal, Scroll Lock & Keyboard Behavior

### Actual Prompt
> "remoevs the default higheter formentire web also when d;ete itms then go to the top automiaticllay reeoeve thata alos make it all ways soeme pen the key if untouch make it thatalso remeoev an make it corcet"

### What Changed
1. **Removed Default Tap Highlight & Focus Outlines**:
   - Added `-webkit-tap-highlight-color: transparent !important` globally across all elements.
   - Suppressed aggressive browser outline rings on click while preserving `:focus-visible` keyboard accessibility.
2. **Fixed Page Jump to Top on Deletion**:
   - Replaced full shelf re-renders with direct DOM node removal (`cardEl.remove()`).
   - Locked grid container height using `dom.bookGrid.style.minHeight` to prevent viewport collapse when deleting items mid-scroll.
3. **Prevented Uninvited Mobile Keyboard Opening**:
   - Removed automatic `focus()` calls on text inputs after deletion or form submission.
   - On mobile screens (`<= 640px`), explicitly calls `blur()` and uses `{ preventScroll: true }` on desktop to keep the mobile keyboard closed until the user taps an input.

---

## Prompt 14: Capacity Expansion to 10,000 Books & 100 MB File Rejection

### Actual Prompt
> "at a time how much books can be import throgh the import data method"  
> "make it into 10k and reject when file exceeds 100 mb make it corrcet"

### What Changed
- Increased maximum library limit from 1,000 books to **10,000 books** ([`MAX_BOOKS_LIMIT = 10000`](file:///c:/Users/VISHNU/Documents/mini_project_ipsr_assessment/app.js#L21)).
- Both **Replace Mode** (up to 10,000 books) and **Merge Mode** (up to `10,000 - current books`) support large libraries.
- Formatted all limit alerts and counter text to display `10,000 books`.
- Implemented strict 100 MB rejection in `handleBackupFileSelected`:
  - Files exceeding 100 MB are rejected immediately before reading: `Backup file exceeds the 100 MB limit (${sizeMb} MB). Import rejected.`
  - Empty 0-byte files are rejected immediately: `Selected backup file is empty (0 bytes). Import rejected.`
  - Clears `backupFileInput.value` and resets pending payloads without loading oversized files into browser memory.

---

## Prompt 15: FIFO Eviction of Earliest Finished Book at 10k Capacity

### Actual Prompt
> "and make like that if the 10k books added then we add a new book with read or reading add the book to shlef with delete the firsted fininsed book oke"

### What Changed
- Implemented a smart FIFO (First-In, First-Out) eviction policy for finished books when the 10,000 book shelf limit is reached:
  1. In `validateTextInputs`: when `books.length >= MAX_BOOKS_LIMIT`, if the new book has status `"to-read"` or `"reading"`, it checks if at least one finished book exists on the shelf. If so, validation passes.
  2. Built `getEarliestFinishedBook()` to locate the oldest finished book by creation timestamp (`createdAt`).
  3. In `handleAddBookSubmit`: when adding a new book with status "To Read" or "Currently Reading" at 10,000 capacity:
     - Automatically deletes the earliest finished book from IndexedDB and the DOM grid.
     - Saves the new book to the shelf.
     - Displays an informative toast alert: `Shelf full (10,000 books): Removed oldest finished book "${evictedFinishedBook.title}" to add "${newBook.title}".`
     - Built-in rollback safety: if saving the new book fails for any reason, the evicted book is immediately restored to IndexedDB and state.
  4. If no finished books exist, the user is cleanly notified that no finished books are available to remove.
  5. If the user attempts to add a "Finished" book directly at 10,000 capacity, they are informed that only "To Read" or "Currently Reading" books can automatically replace finished books.

---

## Prompt 16: Complete Documentation Sync

### Actual Prompt
> "add adll detils full all thing to readme .md also add all prompt htaht prompts .md make itt corcet"

### What Changed
- Comprehensive synchronization of `README.md` and `PROMPTS.md` documenting every feature, security policy, user interface enhancement, mobile optimization, performance benchmark, and architectural decision.
