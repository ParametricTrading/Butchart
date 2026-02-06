import sqlite3InitModule from "./sqlite3.js";


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
    const db = await openCache();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CACHE_STORE, 'readonly');
      const store = tx.objectStore(DB_CACHE_STORE);
      const request = store.get(DB_PATH);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  };

  const writeCache = async (buffer) => {
    const db = await openCache();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(DB_CACHE_STORE);
      store.put(buffer, DB_PATH);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  const fetchDatabase = async () => {
    const response = await fetch(DB_PATH, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${DB_PATH}: ${response.status}`);
    }
    return response.arrayBuffer();
  };

  const initSqlite = async () => {
  sqlite3 = await sqlite3InitModule();
  };


const openDatabase = (buffer) => {
  const bytes = new Uint8Array(buffer);
  db = new sqlite3.oo1.DB(bytes);
};


  const runQuery = (sql, params = []) => {
    const results = [];
    db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      callback: (row) => results.push(row),
    });
    return results;
  };

  const renderRecipes = (rows) => {
    resultsList.innerHTML = '';
    if (!rows.length) {
      resultsList.innerHTML = '<li class="muted">No matching recipes.</li>';
      return;
    }
    rows.forEach((row) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.name;
      button.addEventListener('click', () => showRecipe(row.id));
      li.appendChild(button);
      resultsList.appendChild(li);
    });
  };

  const showRecipe = (recipeId) => {
    const recipe = runQuery('SELECT name FROM recipes WHERE id = ?;', [recipeId])[0];
    if (!recipe) {
      detailsEl.innerHTML = '<p class="muted">Recipe not found.</p>';
      return;
    }

    const ingredients = runQuery(
      `WITH RECURSIVE subtree(id) AS (
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
      ORDER BY i.name;`,
      [recipeId]
    );

    const subRecipes = runQuery(
      `SELECT r.id, r.name
       FROM recipe_components rc
       JOIN recipes r ON r.id = rc.child_recipe_id
       WHERE rc.parent_recipe_id = ?
       ORDER BY r.name;`,
      [recipeId]
    );

    detailsEl.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = recipe.name;
    detailsEl.appendChild(title);

    const ingredientsTitle = document.createElement('h4');
    ingredientsTitle.textContent = 'Ingredients (including sub-recipes)';
    detailsEl.appendChild(ingredientsTitle);

    const ingredientList = document.createElement('ul');
    ingredientList.className = 'list';
    if (ingredients.length) {
      ingredients.forEach((row) => {
        const li = document.createElement('li');
        li.textContent = row.name;
        ingredientList.appendChild(li);
      });
    } else {
      ingredientList.innerHTML = '<li class="muted">No ingredients found.</li>';
    }
    detailsEl.appendChild(ingredientList);

    const subTitle = document.createElement('h4');
    subTitle.textContent = 'Direct sub-recipes';
    detailsEl.appendChild(subTitle);

    const subList = document.createElement('ul');
    subList.className = 'list';
    if (subRecipes.length) {
      subRecipes.forEach((row) => {
        const li = document.createElement('li');
        li.textContent = row.name;
        subList.appendChild(li);
      });
    } else {
      subList.innerHTML = '<li class="muted">None.</li>';
    }
    detailsEl.appendChild(subList);
  };

  const search = () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      setStatus('Enter an ingredient to search.', 'warning');
      return;
    }

    const rows = runQuery(
      `WITH RECURSIVE matching(id) AS (
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
      ORDER BY r.name;`,
      [`%${term}%`]
    );

    renderRecipes(rows);
    if (rows.length) {
      setStatus(`Found ${rows.length} recipe${rows.length === 1 ? '' : 's'}.`, 'success');
    } else {
      setStatus('No recipes matched that ingredient.', 'warning');
    }
  };

  const attachEvents = () => {
    searchButton.addEventListener('click', search);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        search();
      }
    });
  };

  const loadApp = async () => {
    try {
      setStatus('Initializing SQLite…');
      await initSqlite();

      let buffer = null;
      try {
        buffer = await readCache();
      } catch (error) {
        console.warn('Cache read failed:', error);
      }

      if (!buffer) {
        setStatus('Downloading database…');
        buffer = await fetchDatabase();
        await writeCache(buffer);
      } else {
        setStatus('Loaded cached database. Checking for updates…');
        fetchDatabase()
          .then((fresh) => {
            if (fresh.byteLength !== buffer.byteLength) {
              writeCache(fresh);
              buffer = fresh;
              openDatabase(buffer);
              setStatus('Database updated.', 'success');
            }
          })
          .catch((error) => {
            console.warn('Update check failed:', error);
          });
      }

      openDatabase(buffer);
      setStatus('Ready to search.', 'success');
      attachEvents();
    } catch (error) {
      console.error(error);
      setStatus(error.message, 'error');
    }
  };

  loadApp();
})();
