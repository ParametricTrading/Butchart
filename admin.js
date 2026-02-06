console.log("ADMIN.JS VERSION", "DB-FIX");
(() => {


  /* =======================
     DOM references
     ======================= */

  const statusEl = document.getElementById('admin-status');
  const dbFileInput = document.getElementById('db-file');
  const newDbButton = document.getElementById('new-db');
  const exportButton = document.getElementById('export-db');

  const recipeForm = document.getElementById('recipe-form');
  const recipeNameInput = document.getElementById('recipe-name');
  const recipeList = document.getElementById('recipe-list');

  const ingredientForm = document.getElementById('ingredient-form');
  const ingredientNameInput = document.getElementById('ingredient-name');
  const ingredientList = document.getElementById('ingredient-list');

  const linkIngredientForm = document.getElementById('link-ingredient-form');
  const linkRecipeSelect = document.getElementById('link-recipe');
  const linkIngredientSelect = document.getElementById('link-ingredient');
  const recipeIngredientList = document.getElementById('recipe-ingredient-list');

  const linkSubrecipeForm = document.getElementById('link-subrecipe-form');
  const parentRecipeSelect = document.getElementById('parent-recipe');
  const childRecipeSelect = document.getElementById('child-recipe');
  const recipeComponentList = document.getElementById('recipe-component-list');

  /* =======================
     SQLite state
     ======================= */

  let sqlite3;
  let db;

  /* =======================
     Helpers
     ======================= */

  const setStatus = (message, tone = 'info') => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const ensureDatabaseReady = () => {
    if (!db) {
      throw new Error('Load or create a database first.');
    }
  };

  /* =======================
     SQLite lifecycle
     ======================= */

  const initSqlite = async () => {
    if (typeof window.sqlite3InitModule !== 'function') {
      throw new Error('sqlite3.js not loaded or sqlite3InitModule missing.');
    }
    sqlite3 = await window.sqlite3InitModule();
  };

  const openDatabase = (buffer) => {
    db = new sqlite3.oo1.DB(new Uint8Array(buffer));
    exportButton.disabled = false;
  };

  const createEmptyDatabase = () => {
    db = new sqlite3.oo1.DB();

    db.exec(`
      CREATE TABLE recipes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE ingredients (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE recipe_ingredients (
        recipe_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, ingredient_id)
      );

      CREATE TABLE recipe_components (
        parent_recipe_id INTEGER NOT NULL,
        child_recipe_id INTEGER NOT NULL,
        PRIMARY KEY (parent_recipe_id, child_recipe_id),
        CHECK (parent_recipe_id != child_recipe_id)
      );
    `);

    exportButton.disabled = false;
  };

const exportDatabase = () => {
  ensureDatabaseReady();

  const capi = sqlite3.capi;
  const dbPtr = db.pointer;

  const serialized = capi.sqlite3_serialize(
    dbPtr,
    'main',
    0,   // allocate
    0    // size out
  );

  if (!serialized) {
    throw new Error('Failed to serialize database.');
  }

  const bytes = new Uint8Array(serialized);
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'recipes.db';
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};


  /* =======================
     Query helpers
     ======================= */

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
     UI refresh
     ======================= */

  const refreshLists = () => {
    ensureDatabaseReady();

    const recipes = runQuery('SELECT id, name FROM recipes ORDER BY name;');
    const ingredients = runQuery('SELECT id, name FROM ingredients ORDER BY name;');

    const recipeIngredients = runQuery(`
      SELECT r.name AS recipe, i.name AS ingredient
      FROM recipe_ingredients ri
      JOIN recipes r ON r.id = ri.recipe_id
      JOIN ingredients i ON i.id = ri.ingredient_id
      ORDER BY r.name, i.name;
    `);

    const recipeComponents = runQuery(`
      SELECT p.name AS parent, c.name AS child
      FROM recipe_components rc
      JOIN recipes p ON p.id = rc.parent_recipe_id
      JOIN recipes c ON c.id = rc.child_recipe_id
      ORDER BY p.name, c.name;
    `);

    recipeList.innerHTML = recipes.length
      ? recipes.map(r => `<li>${r.name}</li>`).join('')
      : '<li class="muted">No recipes yet.</li>';

    ingredientList.innerHTML = ingredients.length
      ? ingredients.map(i => `<li>${i.name}</li>`).join('')
      : '<li class="muted">No ingredients yet.</li>';

    recipeIngredientList.innerHTML = recipeIngredients.length
      ? recipeIngredients.map(r => `<li>${r.recipe} → ${r.ingredient}</li>`).join('')
      : '<li class="muted">No links yet.</li>';

    recipeComponentList.innerHTML = recipeComponents.length
      ? recipeComponents.map(r => `<li>${r.parent} → ${r.child}</li>`).join('')
      : '<li class="muted">No sub-recipes yet.</li>';

    const populateSelect = (select, rows) => {
      select.innerHTML = '';
      if (!rows.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No options';
        select.appendChild(opt);
        return;
      }
      rows.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        select.appendChild(opt);
      });
    };

    populateSelect(linkRecipeSelect, recipes);
    populateSelect(parentRecipeSelect, recipes);
    populateSelect(childRecipeSelect, recipes);
    populateSelect(linkIngredientSelect, ingredients);
  };

  /* =======================
     Event handlers
     ======================= */

  const handleFileLoad = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    openDatabase(buffer);
    refreshLists();
    setStatus('Database loaded.', 'success');
  };

  const handleAddRecipe = (event) => {
    event.preventDefault();
    ensureDatabaseReady();

    const name = recipeNameInput.value.trim();
    if (!name) return;

    db.exec('INSERT INTO recipes (name) VALUES (?);', [name]);
    recipeNameInput.value = '';
    refreshLists();
    setStatus(`Added recipe “${name}”.`, 'success');
  };

  const handleAddIngredient = (event) => {
    event.preventDefault();
    ensureDatabaseReady();

    const name = ingredientNameInput.value.trim();
    if (!name) return;

    db.exec('INSERT INTO ingredients (name) VALUES (?);', [name]);
    ingredientNameInput.value = '';
    refreshLists();
    setStatus(`Added ingredient “${name}”.`, 'success');
  };

  const handleLinkIngredient = (event) => {
    event.preventDefault();
    ensureDatabaseReady();

    const recipeId = linkRecipeSelect.value;
    const ingredientId = linkIngredientSelect.value;
    if (!recipeId || !ingredientId) return;

    db.exec(
      'INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (?, ?);',
      [recipeId, ingredientId]
    );

    refreshLists();
    setStatus('Linked ingredient to recipe.', 'success');
  };

  const handleLinkSubrecipe = (event) => {
    event.preventDefault();
    ensureDatabaseReady();

    const parentId = parentRecipeSelect.value;
    const childId = childRecipeSelect.value;

    if (!parentId || !childId) return;
    if (parentId === childId) {
      setStatus('A recipe cannot be its own sub-recipe.', 'error');
      return;
    }

    db.exec(
      'INSERT OR IGNORE INTO recipe_components (parent_recipe_id, child_recipe_id) VALUES (?, ?);',
      [parentId, childId]
    );

    refreshLists();
    setStatus('Linked sub-recipe.', 'success');
  };

  /* =======================
     Bootstrap
     ======================= */

  const init = async () => {
    try {
      setStatus('Initializing SQLite…');
      await initSqlite();
      setStatus('Load or create a database to begin.', 'info');
    } catch (err) {
      console.error(err);
      setStatus(err.message, 'error');
    }
  };

  dbFileInput.addEventListener('change', handleFileLoad);
  newDbButton.addEventListener('click', () => {
    try {
      createEmptyDatabase();
      refreshLists();
      setStatus('Created new database.', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });
  exportButton.addEventListener('click', () => {
    try {
      exportDatabase();
      setStatus('Exported recipes.db.', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  recipeForm.addEventListener('submit', handleAddRecipe);
  ingredientForm.addEventListener('submit', handleAddIngredient);
  linkIngredientForm.addEventListener('submit', handleLinkIngredient);
  linkSubrecipeForm.addEventListener('submit', handleLinkSubrecipe);

  init();
})();
