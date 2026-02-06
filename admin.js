(() => {
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

  let sqlite3;
  let db;

  const setStatus = (message, tone = 'info') => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const initSqlite = async () => {
    if (!window.sqlite3InitModule) {
      throw new Error('sqlite3InitModule is not available. Add sqlite3.js and sqlite3.wasm.');
    }
    sqlite3 = await window.sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });
  };

  const openDatabase = (buffer) => {
    const bytes = new Uint8Array(buffer);
    db = new sqlite3.oo1.DB();
    if (typeof db.deserialize === 'function') {
      db.deserialize(bytes);
    } else {
      throw new Error('SQLite WASM does not support deserialize().');
    }
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

  const refreshLists = () => {
    const recipes = runQuery('SELECT id, name FROM recipes ORDER BY name;');
    const ingredients = runQuery('SELECT id, name FROM ingredients ORDER BY name;');
    const recipeIngredients = runQuery(
      `SELECT r.name AS recipe, i.name AS ingredient
       FROM recipe_ingredients ri
       JOIN recipes r ON r.id = ri.recipe_id
       JOIN ingredients i ON i.id = ri.ingredient_id
       ORDER BY r.name, i.name;`
    );
    const recipeComponents = runQuery(
      `SELECT p.name AS parent, c.name AS child
       FROM recipe_components rc
       JOIN recipes p ON p.id = rc.parent_recipe_id
       JOIN recipes c ON c.id = rc.child_recipe_id
       ORDER BY p.name, c.name;`
    );

    recipeList.innerHTML = recipes.length
      ? recipes.map((row) => `<li>${row.name}</li>`).join('')
      : '<li class="muted">No recipes yet.</li>';

    ingredientList.innerHTML = ingredients.length
      ? ingredients.map((row) => `<li>${row.name}</li>`).join('')
      : '<li class="muted">No ingredients yet.</li>';

    recipeIngredientList.innerHTML = recipeIngredients.length
      ? recipeIngredients.map((row) => `<li>${row.recipe} → ${row.ingredient}</li>`).join('')
      : '<li class="muted">No links yet.</li>';

    recipeComponentList.innerHTML = recipeComponents.length
      ? recipeComponents.map((row) => `<li>${row.parent} → ${row.child}</li>`).join('')
      : '<li class="muted">No sub-recipes yet.</li>';

    const buildOptions = (select, items) => {
      select.innerHTML = '';
      if (!items.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No options';
        select.appendChild(option);
        return;
      }
      items.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
      });
    };

    buildOptions(linkRecipeSelect, recipes);
    buildOptions(parentRecipeSelect, recipes);
    buildOptions(childRecipeSelect, recipes);
    buildOptions(linkIngredientSelect, ingredients);
  };

  const ensureDatabaseReady = () => {
    if (!db) {
      throw new Error('Load or create a database first.');
    }
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
    db.exec('INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id) VALUES (?, ?);', [
      recipeId,
      ingredientId,
    ]);
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
    db.exec('INSERT OR IGNORE INTO recipe_components (parent_recipe_id, child_recipe_id) VALUES (?, ?);', [
      parentId,
      childId,
    ]);
    refreshLists();
    setStatus('Linked sub-recipe.', 'success');
  };

  const exportDatabase = () => {
    ensureDatabaseReady();
    if (typeof db.exportBinary !== 'function') {
      throw new Error('SQLite WASM does not support exportBinary().');
    }
    const bytes = db.exportBinary();
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

  const handleFileLoad = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    openDatabase(buffer);
    refreshLists();
    setStatus('Database loaded.', 'success');
  };

  const init = async () => {
    try {
      setStatus('Initializing SQLite…');
      await initSqlite();
      setStatus('Load a database to begin.', 'info');
    } catch (error) {
      console.error(error);
      setStatus(error.message, 'error');
    }
  };

  dbFileInput.addEventListener('change', handleFileLoad);
  newDbButton.addEventListener('click', () => {
    try {
      createEmptyDatabase();
      refreshLists();
      setStatus('Created new database.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
  exportButton.addEventListener('click', () => {
    try {
      exportDatabase();
      setStatus('Exported recipes.db.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
  recipeForm.addEventListener('submit', handleAddRecipe);
  ingredientForm.addEventListener('submit', handleAddIngredient);
  linkIngredientForm.addEventListener('submit', handleLinkIngredient);
  linkSubrecipeForm.addEventListener('submit', handleLinkSubrecipe);

  init();
})();
