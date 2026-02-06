# Butchart Recipes (Browser-Only)

This project is a static, browser-only recipe database powered by SQLite compiled to WebAssembly. It provides:

- **Read-only search** for iPad users (`index.html`).
- **Admin editing** in a desktop browser (`admin.html`).

There is **no backend**. Publishing is done by downloading `recipes.db` and committing it to GitHub Pages.

## Required files (added after merge)

The following files are **not included in this repository** due to binary file limitations and must be added manually:

- `sqlite3.js`
- `sqlite3.wasm`
- `recipes.db`

Download the official SQLite WASM bundle and place `sqlite3.js` + `sqlite3.wasm` in the repo root.

## Admin workflow

1. Open `admin.html` in a desktop browser (Chrome/Edge).
2. Load the current `recipes.db` using **Load recipes.db**, or choose **Create New Database**.
3. Add recipes and ingredients.
4. Link ingredients to recipes.
5. Link sub-recipes to parent recipes (self-links are rejected).
6. Click **Export recipes.db** to download the updated database file.
7. Commit the exported `recipes.db` to GitHub to publish the update.

## Publish workflow

1. Replace the existing `recipes.db` in the repo with the exported file.
2. Commit the updated `recipes.db` to `main`.
3. GitHub Pages serves the latest DB at `https://<org>.github.io/recipes/recipes.db`.

## iPad update process

- On first load, the iPad downloads and caches `recipes.db` in IndexedDB.
- On subsequent loads, it uses the cached DB and checks for updates in the background.
- If an updated DB is detected, the cache is refreshed automatically.

## Notes

- The read-only search uses a **recursive CTE** to include ingredients inherited via sub-recipes.
- The admin app keeps the database in memory until export (no network uploads).
- Safari is supported; no service workers or File System Access API are required.

