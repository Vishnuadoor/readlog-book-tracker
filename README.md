# READLOG — Your Personal Reading Shelf

A minimalist, responsive, and accessible personal reading list tracker built with pure HTML5, modern CSS3, and Vanilla JavaScript. Operates entirely client-side using browser `localStorage` with zero dependencies, build steps, or server requirements.

---

## 1. Project Overview

**READLOG** is designed for readers who value clarity, calm aesthetics, and frictionless tracking. It provides an editorial dashboard experience where you can:
- Record books with their title, author, and reading phase.
- View your entire library ordered newest first.
- Perform instant, case-insensitive searches across titles and authors.
- Update reading phases seamlessly ("To read", "Reading", "Finished").
- Remove completed or unwanted entries safely with accessible confirmation dialogs.
- Keep all data persisted automatically across browser reloads without accounts, passwords, or cloud backends.

---

## 2. Key Features

- **Dynamic Reading Statistics**: Live counters for *Total Books*, *To Read*, *Reading*, and *Finished* that automatically adjust on every addition, status transition, or deletion.
- **Newest-First Library Sorting**: Automatically prioritizes recently added items with stable secondary tie-breaking.
- **Instant Search**: Real-time filtering matching book titles and authors case-insensitively with partial string support.
- **Robust Field Validation**: Inline error indicators for empty or whitespace-only titles and authors, with keyboard focus management and preservation of valid inputs.
- **Status Lifecycle Control**: Individual per-book status selector with immediate badge and visual accent bar color synchronization.
- **Accessible Delete Flow**: Custom accessible confirmation modal preventing accidental data loss, complete with keyboard escape handling and focus trapping.
- **Data Protection & Recovery**: Self-healing `localStorage` parser that handles corrupted data gracefully without overwriting existing browser storage.
- **Responsive & Accessible Design**: Crafted for viewports from 320px mobile screens to wide desktop monitors, meeting WCAG AA contrast standards and honoring `prefers-reduced-motion`.

---

## 3. Technology Stack

- **Markup**: HTML5 (Semantic elements: `<header>`, `<main>`, `<section>`, `<article>`, `<dialog>`/modal semantics, ARIA live regions)
- **Styling**: Vanilla CSS3 (Custom properties/tokens, CSS Grid, Flexbox, high-contrast accessible color palette, reduced-motion queries)
- **Logic**: Vanilla JavaScript (ES2022+, DOM API with safe `textContent` construction, zero external dependencies)
- **Persistence**: Browser `localStorage` (Storage key: `bookTrackerBooks`)
- **Typography**: Inter (Google Fonts with robust system sans-serif fallback stack)
- **Icons**: Inline SVG vector icons (clean, scalable, no external icon library fonts or asset requests)

---

## 4. Project File Structure

```text
mini_project_ipsr_assessment/
├── index.html       # Semantic page markup, forms, modal dialog, and accessibility structure
├── style.css        # Complete CSS design system, typography, cards, layout, and animations
├── app.js           # Core state management, validation, DOM rendering, and localStorage logic
├── README.md        # Comprehensive technical documentation, testing, and deployment guide
├── PROMPTS.md       # AI-assisted development logs, prompt records, and debugging analysis
└── .gitignore       # Exclusions for OS caches, editor files, and temporary logs
```

---

## 5. How to Run the App Locally

Because READLOG uses pure vanilla web technologies, no build tools, compilers, or Node packages are required.

### Method A: Direct Browser File Launch (Zero Installation)
1. Clone or download the repository to your computer.
2. Locate `index.html` in your file explorer.
3. Double-click `index.html` (or right-click and choose **Open with > Google Chrome / Microsoft Edge / Firefox / Safari**).

### Method B: Using a Lightweight Local HTTP Server

#### Using Python (Built into Windows/macOS/Linux):
```bash
# Navigate to the project root directory
cd path/to/mini_project_ipsr_assessment

# Start the built-in HTTP server on port 8000
python -m http.server 8000
```
Open your browser and navigate to: `http://localhost:8000`

#### Using Node.js:
```bash
# Using npx serve (without installing dependencies)
npx serve .
```

---

## 6. How LocalStorage Works

READLOG stores your book collection entirely in your browser's private Web Storage area under a single key:

```javascript
const STORAGE_KEY = 'bookTrackerBooks';
```

### Stored Data Schema
The stored value is serialized as a JSON array of book objects:

```json
[
  {
    "id": "e4b1c708-2c49-4bc7-9a89-2182ff19cb41",
    "title": "Aadujeevitham (Goat Days)",
    "author": "Benyamin",
    "status": "Reading",
    "createdAt": 1728923400000
  }
]
```

### Key Considerations:
1. **Browser & Domain Isolation**: `localStorage` is scoped to the specific browser and origin (domain, protocol, and port). Data entered in Chrome will not appear in Edge or Firefox, and data entered in an Incognito/Private window is discarded when the session ends.
2. **Device Independence**: Data is stored physically on your local device. It does not automatically synchronize across phones, laptops, or different machines.
3. **Data Recovery Guarantee**: If the stored JSON string is ever corrupted, READLOG catches the parsing error, displays an informative recovery banner, and operates in memory without blindly wiping out the recoverable raw storage string.

---

## 7. How to Test the Application

The application includes verified test coverage across all core workflows:

| Test ID | Scenario | Input / Action | Expected Result |
| :--- | :--- | :--- | :--- |
| **Test A** | Add valid book | Title: "Aadujeevitham", Author: "Benyamin", Status: "To read" | Book appears at top of shelf; Total Books = 1; To Read = 1. |
| **Test B** | Empty title | Blank title, valid author | Form submission blocked; inline red error on title input. |
| **Test C** | Empty author | Valid title, blank author | Form submission blocked; inline red error on author input. |
| **Test D** | Whitespace-only input | Title: `"   "`, Author: "Benyamin" | Input treated as empty; submission blocked with inline message. |
| **Test E** | Search by author | Query: `"ben"` | Matching book remains visible; non-matching books hidden. |
| **Test F** | Case-insensitive search | Query: `"BEN"` | Identical match returned regardless of upper/lower case. |
| **Test G** | Search by title | Query: `"aadu"` | Book matching title partial string appears. |
| **Test H** | No search results | Query: `"xyz123"` | "No matching books found" state displayed; storage unchanged. |
| **Test I** | Change status | Select "Finished" on book card | Badge updates to green; Finished count = 1; To Read count = 0. |
| **Test J** | Refresh persistence | Reload browser (F5) | Card retains title, author, updated status, and count. |
| **Test K** | Delete book | Click trash icon -> Confirm | Book removed from shelf; Total Books = 0; empty state appears. |
| **Test L** | Long text handling | Add 150+ character title and author | Text wraps neatly; zero horizontal overflow or clipping. |
| **Test M** | Responsive layout | Viewports: 1280px, 768px, 375px, 320px | Zero horizontal scrollbars; layout adapts fluidly. |
| **Test N** | Storage recovery | Load malformed JSON in localStorage | Graceful banner displayed; no uncaught JS crashes. |
| **Test O** | Duplicate & ordering | Rapid entry, status changes during search | Newest book remains first; correct items targeted by unique ID. |

---

## 8. Deployment via GitHub Pages

This repository is structured for zero-configuration deployment with GitHub Pages.

### Step-by-Step Instructions:

1. **Create a GitHub Repository**:
   - Go to [GitHub New Repository](https://github.com/new).
   - Name the repository: `book-tracker`.
   - Set visibility to **Public**.
   - Do not initialize with a README (this repository already contains one).

2. **Push the Workspace to GitHub**:
   ```bash
   # From your project root:
   git init
   git add .
   git commit -m "feat: complete READLOG book tracker application"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/book-tracker.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - In your GitHub repository, click **Settings** (top right tab).
   - In the left sidebar, click **Pages** (under the "Code and automation" section).
   - Under **Build and deployment > Source**, select **Deploy from a branch**.
   - Under **Branch**, select `main` and folder `/ (root)`.
   - Click **Save**.

4. **Verify Live Deployment**:
   - Allow 1–2 minutes for GitHub Actions to complete the build.
   - Your live site will be accessible at:
     `https://<YOUR_GITHUB_USERNAME>.github.io/book-tracker/`
   - Open the link in a new private/incognito window to verify the site loads cleanly without console errors.

---

## 9. Known Limitations

- **Browser-Specific Storage**: Reading records are stored in browser `localStorage`. Switching between different browsers or devices does not sync data.
- **Private Browsing Quota**: In some private/incognito modes, browsers enforce strict quotas or purge storage when all tabs are closed.
- **Manual Export/Import**: The current version does not yet include a JSON export/import button for manual cross-device migration.

---

## 10. AI-Assisted Development Note

This application was developed using an AI-assisted paired workflow. AI tooling was used for architectural planning, semantic DOM structuring, accessible CSS token design, and headless Chrome browser automation via the Chrome DevTools Protocol. Every requirement, validation boundary, and test case was independently run and validated against real browser instances.

---

## 11. Project Links

- **Live Application**: `https://<YOUR_GITHUB_USERNAME>.github.io/book-tracker/` *(Replace with your deployed URL)*
- **GitHub Repository**: `https://github.com/<YOUR_GITHUB_USERNAME>/book-tracker` *(Replace with your repository URL)*
