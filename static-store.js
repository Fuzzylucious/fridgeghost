'use strict';
/* FridgeGhost static store — the no-server twin of the Node backend.
   Used when the app is served statically (e.g. GitHub Pages) and no /api
   backend answers: fridge + shopping list live in localStorage, and the two
   free upstream APIs (Open Food Facts, TheMealDB) are called directly from
   the browser — both send `Access-Control-Allow-Origin: *`, so no proxy is
   needed. Every route mirrors the server's contract (same paths, same
   payload shapes, same error strings) so the frontend's api() calls work
   unchanged in either mode. No DOM access here — only localStorage + fetch —
   so this file is unit-testable in plain Node. */

(function (global) {
  var FRIDGE_KEY = 'fridgeghost:fridge';
  var SHOPPING_KEY = 'fridgeghost:shopping';
  var OFF_BASE = 'https://world.openfoodfacts.org/api/v0';
  var MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

  /* ---------- storage (localStorage, in-memory fallback) ---------- */
  var memory = { fridge: null, shopping: null };

  function storageOk() {
    try {
      return typeof global.localStorage !== 'undefined' && global.localStorage !== null;
    } catch (_) {
      return false;
    }
  }

  function readRows(key, memKey) {
    if (storageOk()) {
      try {
        var raw = global.localStorage.getItem(key);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return memory[memKey] ? memory[memKey].slice() : [];
  }

  function writeRows(key, memKey, rows) {
    if (storageOk()) {
      try {
        global.localStorage.setItem(key, JSON.stringify(rows));
        return;
      } catch (_) {
        /* storage full / blocked — fall through to memory */
      }
    }
    memory[memKey] = rows.slice();
  }

  function loadItems() { return readRows(FRIDGE_KEY, 'fridge'); }
  function saveItems(rows) { writeRows(FRIDGE_KEY, 'fridge', rows); }
  function loadShopping() { return readRows(SHOPPING_KEY, 'shopping'); }
  function saveShopping(rows) { writeRows(SHOPPING_KEY, 'shopping', rows); }

  function newId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- expiry helpers (mirror src/expiry.ts) ---------- */
  function parseExpiryDate(expiryDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiryDate || '');
    if (!m) return null;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);
    var d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }

  function isValidExpiryDate(value) {
    return typeof value === 'string' && parseExpiryDate(value) !== null;
  }

  function localMidnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysLeft(expiryDate, now) {
    var expiry = parseExpiryDate(expiryDate);
    if (!expiry) return NaN;
    var diff = localMidnight(expiry).getTime() - localMidnight(now || new Date()).getTime();
    return Math.round(diff / 86400000);
  }

  function urgencyFor(days) {
    if (days < 0) return 'expired';
    if (days <= 2) return 'critical';
    if (days <= 5) return 'stirring';
    return 'resting';
  }

  function sortByExpiry(items) {
    return items.slice().sort(function (a, b) {
      return String(a.expiryDate).localeCompare(String(b.expiryDate));
    });
  }

  /* ---------- small helpers ---------- */
  function asOptionalString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  }

  function asOptionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  function normalizeName(a) {
    return String(a).trim().toLowerCase();
  }

  function ingredientInFridge(ingredientName, items) {
    var want = normalizeName(ingredientName);
    if (!want) return false;
    return items.some(function (item) {
      var have = normalizeName(item.name);
      return have !== '' && (have.indexOf(want) !== -1 || want.indexOf(have) !== -1);
    });
  }

  function ok(payload) { return { status: 200, payload: payload }; }
  function created(payload) { return { status: 201, payload: payload }; }
  function noContent() { return { status: 204, payload: undefined }; }
  function err(status, message) { return { status: status, payload: { error: message } }; }

  /* ---------- upstream clients (mirror src/off/*.ts) ---------- */
  async function fetchJson(url, label) {
    var res;
    try {
      res = await global.fetch(url, { headers: { Accept: 'application/json' } });
    } catch (e) {
      throw new Error(label + ' unreachable: ' + (e instanceof Error ? e.message : String(e)));
    }
    if (!res.ok) throw new Error(label + ' returned HTTP ' + res.status);
    try {
      return await res.json();
    } catch (_) {
      throw new Error(label + ' returned invalid JSON');
    }
  }

  async function lookupBarcode(barcode) {
    var data = await fetchJson(
      OFF_BASE + '/product/' + encodeURIComponent(barcode) + '.json',
      'Open Food Facts',
    );
    if (data.status !== 1 || !data.product) return { found: false };
    var p = data.product;
    var name = String(p.product_name || p.product_name_en || '').trim();
    if (!name) return { found: false };
    return {
      found: true,
      product: {
        name: name,
        brand: (p.brands || '').trim() || undefined,
        image: p.image_url || p.image_front_url || undefined,
        categories: (p.categories || '').trim() || undefined,
      },
    };
  }

  function parseIngredients(meal) {
    var out = [];
    for (var i = 1; i <= 20; i++) {
      var rawName = meal['strIngredient' + i];
      var rawMeasure = meal['strMeasure' + i];
      var name = typeof rawName === 'string' ? rawName.trim() : '';
      if (!name) continue;
      out.push({ name: name, measure: typeof rawMeasure === 'string' ? rawMeasure.trim() : '' });
    }
    return out;
  }

  function asString(value) {
    return typeof value === 'string' ? value : '';
  }

  function parseMealDetail(meal) {
    return {
      id: asString(meal.idMeal),
      name: asString(meal.strMeal),
      thumb: asString(meal.strMealThumb),
      category: asString(meal.strCategory),
      area: asString(meal.strArea),
      instructions: asString(meal.strInstructions),
      ingredients: parseIngredients(meal),
    };
  }

  async function searchMealsByIngredient(ingredient) {
    var data = await fetchJson(
      MEALDB_BASE + '/filter.php?i=' + encodeURIComponent(ingredient),
      'TheMealDB',
    );
    if (!data.meals) return [];
    return data.meals
      .filter(function (m) { return m.idMeal && m.strMeal; })
      .map(function (m) {
        return { id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb || '' };
      });
  }

  async function getMealById(id) {
    var data = await fetchJson(
      MEALDB_BASE + '/lookup.php?i=' + encodeURIComponent(id),
      'TheMealDB',
    );
    if (!Array.isArray(data.meals) || data.meals.length === 0) return null;
    return parseMealDetail(data.meals[0]);
  }

  /* ---------- route handler — mirrors src/server.ts ---------- */
  async function handle(method, pathname, search, body) {
    /* Health */
    if (method === 'GET' && pathname === '/api/health') {
      return ok({ ok: true, version: '0.1.0-static' });
    }

    /* Fridge items */
    if (method === 'GET' && pathname === '/api/items') {
      return ok(sortByExpiry(loadItems()));
    }

    if (method === 'POST' && pathname === '/api/items') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return err(400, 'Request body must be a JSON object');
      }
      var name = asOptionalString(body.name);
      if (!name) return err(400, 'Missing required field: name');
      if (typeof body.expiryDate !== 'string' || !isValidExpiryDate(body.expiryDate)) {
        return err(400, 'Missing or invalid expiryDate (expected YYYY-MM-DD)');
      }
      var item = {
        id: newId(),
        name: name,
        brand: asOptionalString(body.brand),
        category: asOptionalString(body.category),
        quantity: asOptionalNumber(body.quantity) !== undefined ? asOptionalNumber(body.quantity) : 1,
        unit: asOptionalString(body.unit),
        expiryDate: body.expiryDate,
        barcode: asOptionalString(body.barcode),
        image: asOptionalString(body.image),
        addedAt: new Date().toISOString(),
      };
      var items = loadItems();
      items.push(item);
      saveItems(items);
      return created(item);
    }

    var itemDelete = /^\/api\/items\/([^/]+)$/.exec(pathname);
    if (method === 'DELETE' && itemDelete) {
      var delId = decodeURIComponent(itemDelete[1]);
      var delItems = loadItems();
      var delIdx = delItems.findIndex(function (i) { return i.id === delId; });
      if (delIdx === -1) return err(404, 'Item not found');
      delItems.splice(delIdx, 1);
      saveItems(delItems);
      return noContent();
    }

    /* Barcode lookup */
    if (method === 'GET' && pathname === '/api/lookup') {
      var barcode = search.get('barcode');
      if (!barcode || !/^\d+$/.test(barcode)) {
        return err(400, 'Missing or invalid barcode (digits only)');
      }
      try {
        return ok(await lookupBarcode(barcode));
      } catch (e) {
        return err(502, e instanceof Error ? e.message : 'Open Food Facts unreachable');
      }
    }

    /* Hauntings */
    if (method === 'GET' && pathname === '/api/hauntings') {
      var rawDays = search.get('days');
      var days = rawDays === null ? 3 : Number(rawDays);
      if (!Number.isInteger(days) || days < 0) {
        return err(400, 'Invalid days parameter (expected a non-negative integer)');
      }
      var now = new Date();
      var hauntings = sortByExpiry(loadItems())
        .map(function (item) {
          var left = daysLeft(item.expiryDate, now);
          return { item: item, daysLeft: left, urgency: urgencyFor(left) };
        })
        .filter(function (h) { return h.daysLeft <= days; })
        .sort(function (a, b) { return a.daysLeft - b.daysLeft; });
      return ok(hauntings);
    }

    /* Recipes */
    if (method === 'GET' && pathname === '/api/recipes') {
      var raw = search.get('ingredients') || '';
      var ingredients = raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
      if (ingredients.length === 0) {
        return err(400, 'Missing ingredients query parameter');
      }
      var first = ingredients[0];
      var summaries;
      try {
        summaries = await searchMealsByIngredient(first);
      } catch (e) {
        return err(502, e instanceof Error ? e.message : 'TheMealDB unreachable');
      }
      if (summaries.length === 0) {
        return ok({ meals: [], note: 'No meals found for "' + first + '". Try a different ingredient.' });
      }
      var meals = [];
      try {
        for (var k = 0; k < Math.min(3, summaries.length); k++) {
          var detail = await getMealById(summaries[k].id);
          if (detail) meals.push(detail);
        }
      } catch (e) {
        return err(502, e instanceof Error ? e.message : 'TheMealDB unreachable');
      }
      return ok({ meals: meals });
    }

    /* Shopping list */
    if (method === 'GET' && pathname === '/api/shopping-list') {
      return ok(loadShopping());
    }

    if (method === 'POST' && pathname === '/api/shopping-list') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return err(400, 'Request body must be a JSON object');
      }
      var shopName = asOptionalString(body.name);
      if (!shopName) return err(400, 'Missing required field: name');
      var entry = {
        id: newId(),
        name: shopName,
        quantity: asOptionalNumber(body.quantity),
        unit: asOptionalString(body.unit),
        reason: asOptionalString(body.reason),
        addedAt: new Date().toISOString(),
        checked: false,
      };
      var list = loadShopping();
      list.push(entry);
      saveShopping(list);
      return created(entry);
    }

    var shopPatch = /^\/api\/shopping-list\/([^/]+)$/.exec(pathname);
    if (method === 'PATCH' && shopPatch) {
      var patchId = decodeURIComponent(shopPatch[1]);
      if (!body || typeof body !== 'object' || typeof body.checked !== 'boolean') {
        return err(400, 'Request body must be { checked: boolean }');
      }
      var patchList = loadShopping();
      var patchEntry = null;
      for (var pi = 0; pi < patchList.length; pi++) {
        if (patchList[pi].id === patchId) { patchEntry = patchList[pi]; break; }
      }
      if (!patchEntry) return err(404, 'Shopping list entry not found');
      patchEntry.checked = body.checked;
      saveShopping(patchList);
      return ok(patchEntry);
    }

    var shopDelete = /^\/api\/shopping-list\/([^/]+)$/.exec(pathname);
    if (method === 'DELETE' && shopDelete) {
      var shopDelId = decodeURIComponent(shopDelete[1]);
      var shopDelList = loadShopping();
      var shopDelIdx = shopDelList.findIndex(function (e) { return e.id === shopDelId; });
      if (shopDelIdx === -1) return err(404, 'Shopping list entry not found');
      shopDelList.splice(shopDelIdx, 1);
      saveShopping(shopDelList);
      return noContent();
    }

    /* Recipe detail by id */
    var recipeDetail = /^\/api\/recipes\/([^/]+)$/.exec(pathname);
    if (method === 'GET' && recipeDetail) {
      var recipeId = decodeURIComponent(recipeDetail[1]);
      var recipeDetailMeal;
      try {
        recipeDetailMeal = await getMealById(recipeId);
      } catch (e) {
        return err(502, e instanceof Error ? e.message : 'TheMealDB unreachable');
      }
      if (!recipeDetailMeal) return err(404, 'Meal not found');
      return ok(recipeDetailMeal);
    }

    /* Add missing recipe ingredients to the shopping list */
    var addMissing = /^\/api\/recipes\/([^/]+)\/add-missing$/.exec(pathname);
    if (method === 'POST' && addMissing) {
      var mealId = decodeURIComponent(addMissing[1]);
      var meal;
      try {
        meal = await getMealById(mealId);
      } catch (e) {
        return err(502, e instanceof Error ? e.message : 'TheMealDB unreachable');
      }
      if (!meal) return err(404, 'Meal not found');
      var fridge = loadItems();
      var shop = loadShopping();
      var added = [];
      var alreadyHave = [];
      for (var mi = 0; mi < meal.ingredients.length; mi++) {
        var ing = meal.ingredients[mi];
        if (ingredientInFridge(ing.name, fridge)) {
          alreadyHave.push(ing.name);
          continue;
        }
        var existing = null;
        for (var ei = 0; ei < shop.length; ei++) {
          if (!shop[ei].checked && normalizeName(shop[ei].name) === normalizeName(ing.name)) {
            existing = shop[ei];
            break;
          }
        }
        if (existing) {
          alreadyHave.push(ing.name);
          continue;
        }
        // TheMealDB's measure already contains the amount ("1 1/4 cup",
        // "3 Cups", "2") — store it whole as the unit with NO separate
        // quantity, or the list renders the amount twice (bug 3).
        var newEntry = {
          id: newId(),
          name: ing.name,
          unit: ing.measure || undefined,
          reason: 'for ' + meal.name,
          addedAt: new Date().toISOString(),
          checked: false,
        };
        shop.push(newEntry);
        added.push(newEntry);
      }
      saveShopping(shop);
      return ok({ added: added, alreadyHave: alreadyHave });
    }

    if (pathname.indexOf('/api/') === 0) {
      return err(404, 'Unknown API route');
    }
    return err(404, 'Not found');
  }

  /* Drop-in replacement for the fetch-based api() used by app.js. */
  async function request(path, options) {
    options = options || {};
    var method = String(options.method || 'GET').toUpperCase();
    var body;
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch (_) {
        throw new Error('Invalid JSON body');
      }
    }
    var url = new URL(path, 'http://static.local');
    var result = await handle(method, url.pathname, url.searchParams, body);
    if (result.status === 204) return undefined;
    if (result.status >= 400) {
      throw new Error(result.payload && result.payload.error
        ? result.payload.error
        : 'Request to ' + path + ' failed (' + result.status + ')');
    }
    return result.payload;
  }

  global.FridgeGhostStatic = {
    request: request,
    handle: handle,
    version: '0.1.0-static',
  };
})(typeof window !== 'undefined' ? window : globalThis);
