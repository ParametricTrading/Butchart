(() => {
  const statusEl = document.getElementById('status');
  const searchInput = document.getElementById('ingredient-search');
  const searchButton = document.getElementById('search-button');
  const resultsList = document.getElementById('results');
  const detailsEl = document.getElementById('recipe-details');

  const DB_CACHE_KEY = 'recipes-db';
  const DB_CACHE_STORE = 'files';
  const DB_PATH = 'recipes.db';

  let sqlite3;
  let db;

  const setStatus = (message, tone = 'info') => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  /* =======================
     IndexedDB cache helpers
     ======================= */

  const openCache = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CACHE_KEY, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DB_CACHE_STORE);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

  const readCache = async () => {
    const idb = await openCache();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_CACHE_STORE, 'readonly');
      const store = tx.objectStore(DB_CACHE_STORE);
      const req = store.get(DB_PATH);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  };

  const writeCache = async (buffer) => {
    const idb = await openCache();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(DB_CACHE_STORE, 'readwrite');
      tx.objectStore(DB_CACHE_STORE).put(buffer, DB_PATH);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  /* =======================
     SQLite initialization
     ======================= */

  const initSqlite = async () => {
    if (typeof window.sqlite3InitModule !== 'function') {
      throw new Error('sqlite3.js not loaded or sqlite3InitModule missing.');
    }
    sqlite3 = await window.sqlite3InitModule();
  };

  const openDatabase = (buffer) => {
    db = new sqlite3.oo1.DB(new Uint8Array(buffer));
  };

  /* =======================
     DB helpers
     ======================= */

  const fetchDatabase = async () => {
    const res = await fetch(DB_PATH, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${DB_PATH} (${res.status})`);
    }
    return res.arrayBuffer();
  };

  const runQuery = (sql, params = []) => {
    const rows = [];
    db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      callback: (row) => rows.push(row),
    });
    return rows;
  };

  /* =======================
     UI rendering
     ======================= */

  const renderRecipes = (rows) => {
    resultsList.innerHTML = '';
    if (!rows.length) {
      resultsList.innerHTML = '<li class="muted">No matching recipes.</li>';
      return;
    }

    rows.forEach((row) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = row.name;
      btn.onclick = () => showRecipe(row.id);
      li.appendChild(btn);
      resultsList.appendChild(li);
    });
  };

  const showRecipe = (recipeId) => {
    const recipe = runQuery(
      'SELECT name FROM recipes WHERE id = ?;',
      [recipeId]
    )[0];

    if (!recipe) {
      detailsEl.innerHTML = '<p class="muted">Recipe not found.</p>';
      return;
    }

    const ingredients = runQuery(
      `
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM recipes WHERE id = ?
        UNION ALL
        SELECT rc.child_recipe_id
        FROM recipe_components rc
        JOIN subtree s ON rc.parent_recipe_id = s.id
      )
      SELECT DISTINCT i.name
      FROM subtree s
      JOIN recipe_ingredients ri ON ri.recipe_id = s.id
      JOIN ingredients i ON i.id = ri.ingredient_id
      ORDER BY i.name;
      `,
      [recipeId]
    );

    const subRecipes = runQuery(
      `
      SELECT r.id, r.name
      FROM recipe_components rc
      JOIN recipes r ON r.id = rc.child_recipe_id
      WHERE rc.parent_recipe_id = ?
      ORDER BY r.name;
      `,
      [recipeId]
    );

    detailsEl.innerHTML = `
      <h3>${recipe.name}</h3>
      <h4>Ingredients (including sub-recipes)</h4>
      <ul class="list">
        ${ingredients.length
          ? ingredients.map(i => `<li>${i.name}</li>`).join('')
          : '<li class="muted">No ingredients found.</li>'}
      </ul>
      <h4>Direct sub-recipes</h4>
      <ul class="list">
        ${subRecipes.length
          ? subRecipes.map(r => `<li>${r.name}</li>`).join('')
          : '<li class="muted">None.</li>'}
      </ul>
    `;
  };

  /* =======================
     Search
     ======================= */

  const search = () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      setStatus('Enter an ingredient to search.', 'warning');
      return;
    }

    const rows = runQuery(
      `
      WITH RECURSIVE matching(id) AS (
        SELECT r.id
        FROM recipes r
        JOIN recipe_ingredients ri ON r.id = ri.recipe_id
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE lower(i.name) LIKE ?
        UNION ALL
        SELECT rc.parent_recipe_id
        FROM recipe_components rc
        JOIN matching m ON rc.child_recipe_id = m.id
      )
      SELECT DISTINCT r.id, r.name
      FROM matching m
      JOIN recipes r ON r.id = m.id
      ORDER BY r.name;
      `,
      [`%${term}%`]
    );

    renderRecipes(rows);
    setStatus(
      rows.length
        ? `Found ${rows.length} recipe${rows.length === 1 ? '' : 's'}.`
        : 'No recipes matched that ingredient.',
      rows.length ? 'success' : 'warning'
    );
  };

  const attachEvents = () => {
    searchButton.onclick = search;
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') search();
    };
  };

  /* =======================
     App bootstrap
     ======================= */

  const loadApp = async () => {
    try {
      setStatus('Initializing SQLite…');
      await initSqlite();

      let buffer = await readCache();

      if (!buffer) {
        setStatus('Downloading database…');
        buffer = await fetchDatabase();
        await writeCache(buffer);
      }

      openDatabase(buffer);
      attachEvents();
      setStatus('Ready to search.', 'success');
    } catch (err) {
      console.error(err);
      setStatus(err.message, 'error');
    }
  };

  loadApp();
})();
