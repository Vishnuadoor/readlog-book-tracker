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
