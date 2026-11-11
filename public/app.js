'use strict';
/* FridgeGhost frontend — vanilla JS, no external JS dependencies.
   All server-provided strings are inserted via textContent / createElement
   (never innerHTML with untrusted data). */

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- DOM refs ---------- */
const alertBox = $('#alert');
const serverStatus = $('#server-status');
const serverStatusText = $('#server-status-text');

const addForm = $('#add-form');
const itemName = $('#item-name');
const itemQuantity = $('#item-quantity');
const itemUnit = $('#item-unit');
const itemExpiry = $('#item-expiry');
const itemCategory = $('#item-category');
const itemBrand = $('#item-brand');
const itemBarcode = $('#item-barcode');
const lookupBtn = $('#lookup-btn');
const lookupStatus = $('#lookup-status');
const lookupPreview = $('#lookup-preview');
const lookupImage = $('#lookup-image');
const lookupName = $('#lookup-name');
const lookupMeta = $('#lookup-meta');
const addSubmit = $('#add-submit');
const formError = $('#form-error');

const hauntingDays = $('#haunting-days');
const hauntingsList = $('#hauntings-list');
const fridgeList = $('#fridge-list');
const fridgeCount = $('#fridge-count');

const suggestBtn = $('#suggest-recipes-btn');
const recipesBasis = $('#recipes-basis');
const recipesList = $('#recipes-list');

const shoppingForm = $('#shopping-form');
const shoppingName = $('#shopping-name');
const shoppingQuantity = $('#shopping-quantity');
const shoppingUnit = $('#shopping-unit');
const shoppingError = $('#shopping-error');
const shoppingListEl = $('#shopping-list');

/* ---------- State ---------- */
let fridgeItems = [];
let shoppingItems = [];
let hauntings = [];

/* ---------- Helpers ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function showAlert(message, kind = 'error') {
  alertBox.hidden = false;
  alertBox.textContent = message;
  alertBox.classList.toggle('info', kind === 'info');
}
function hideAlert() {
  alertBox.hidden = true;
  alertBox.textContent = '';
}

function spinner() {
  const wrap = el('div', 'spinner');
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-label', 'Loading');
  wrap.append(el('span'), el('span'), el('span'));
  return wrap;
}

function emptyState(text) {
  return el('p', 'empty-state', text);
}

/** Extract a readable message from a failed fetch. */
async function apiErrorMessage(res, fallback) {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error) return data.error;
    if (data && typeof data.message === 'string' && data.message) return data.message;
  } catch (_) { /* not JSON — fall through */ }
  return fallback || `Request failed (${res.status})`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, `Request to ${path} failed (${res.status})`));
  return res.json();
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Whole days from today (local) to the expiry date. Negative = expired. */
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d - today) / 86400000);
}

function urgencyFromDays(days) {
  if (days === null) return 'resting';
  if (days < 0) return 'expired';
  if (days <= 1) return 'critical';
  if (days <= 3) return 'stirring';
  return 'resting';
}

function urgencyLabel(urgency, days) {
  switch (urgency) {
    case 'expired': return days === -1 ? 'Expired 1 day ago' : `Expired ${-days} days ago`;
    case 'critical': return days === 0 ? 'Expires today' : 'Expires tomorrow';
    case 'stirring': return `${days} days left`;
    case 'resting': return days === null ? 'No expiry' : `${days} days left`;
    default: return '';
  }
}

function urgencyClass(urgency) { return `badge-${urgency}`; }

function setBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

/* ---------- Health ---------- */
async function checkHealth() {
  try {
    const data = await api('/api/health');
    serverStatus.classList.remove('down');
    serverStatus.classList.add('ok');
    serverStatusText.textContent = data && data.version
      ? `The fridge is awake · v${data.version}`
      : 'The fridge is awake';
  } catch (err) {
    serverStatus.classList.remove('ok');
    serverStatus.classList.add('down');
    serverStatusText.textContent = `Fridge unreachable — ${err.message}`;
  }
}

/* ---------- Fridge ---------- */
function renderFridge() {
  fridgeList.textContent = '';
  if (fridgeItems.length === 0) {
    fridgeList.appendChild(emptyState('The fridge is empty. Add something before the ghosts get hungry.'));
    fridgeCount.textContent = '';
    return;
  }
  fridgeCount.textContent = `${fridgeItems.length} item${fridgeItems.length === 1 ? '' : 's'} in the fridge`;

  const sorted = [...fridgeItems].sort((a, b) => {
    const da = a.expiryDate || '9999-12-31';
    const db = b.expiryDate || '9999-12-31';
    return da.localeCompare(db);
  });

  for (const item of sorted) {
    const days = daysUntil(item.expiryDate);
    const urgency = urgencyFromDays(days);
    const isHaunting = urgency === 'expired' || urgency === 'critical';

    const row = el('article', `fridge-item${isHaunting ? ` haunting-${urgency}` : ''}`);
    row.dataset.id = item.id;

    if (item.image) {
      const img = el('img', 'fridge-item-thumb');
      img.src = item.image;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      row.appendChild(img);
    }

    const body = el('div', 'fridge-item-body');

    const nameRow = el('p', 'fridge-item-name');
    if (isHaunting) nameRow.appendChild(el('span', 'ghost-marker', '👻'));
    nameRow.appendChild(document.createTextNode(item.name));
    body.appendChild(nameRow);

    const meta = [];
    if (item.brand) meta.push(item.brand);
    if (item.quantity !== undefined && item.quantity !== null && item.quantity !== '') {
      meta.push(`Qty ${item.quantity}${item.unit ? ` ${item.unit}` : ''}`);
    }
    if (item.category) meta.push(item.category);
    if (meta.length) body.appendChild(el('p', 'fridge-item-meta', meta.join(' · ')));

    const foot = el('div', 'fridge-item-foot');
    foot.appendChild(el('span', 'fridge-item-expiry', `Expires ${formatDate(item.expiryDate)}`));
    foot.appendChild(el('span', `badge ${urgencyClass(urgency)}`, urgencyLabel(urgency, days)));
    body.appendChild(foot);
    row.appendChild(body);

    const del = el('button', 'btn btn-danger', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete ${item.name}`);
    del.addEventListener('click', () => deleteItem(item.id, item.name, del));
    row.appendChild(del);

    fridgeList.appendChild(row);
  }
}

async function loadFridge() {
  fridgeList.textContent = '';
  fridgeList.appendChild(spinner());
  try {
    const data = await api('/api/items');
    fridgeItems = Array.isArray(data) ? data : [];
    renderFridge();
  } catch (err) {
    fridgeList.textContent = '';
    fridgeList.appendChild(emptyState(`Could not load the fridge — ${err.message}`));
  }
}

async function deleteItem(id, name, button) {
  button.disabled = true;
  try {
    await api(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    fridgeItems = fridgeItems.filter((i) => i.id !== id);
    renderFridge();
    renderHauntings();
  } catch (err) {
    showAlert(`Could not delete “${name}” — ${err.message}`);
    button.disabled = false;
  }
}

/* ---------- Add item ---------- */
function validateAddForm() {
  const name = itemName.value.trim();
  const expiry = itemExpiry.value;
  if (!name) return 'Item name is required.';
  if (!expiry) return 'Expiry date is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return 'Expiry date must be YYYY-MM-DD.';
  const d = new Date(`${expiry}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Expiry date is not a valid date.';
  return null;
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  formError.hidden = true;

  const error = validateAddForm();
  if (error) {
    formError.textContent = error;
    formError.hidden = false;
    (itemName.value.trim() ? itemExpiry : itemName).focus();
    return;
  }

  const payload = {
    name: itemName.value.trim(),
    expiryDate: itemExpiry.value,
  };
  const qty = parseFloat(itemQuantity.value);
  if (!Number.isNaN(qty)) payload.quantity = qty;
  if (itemUnit.value.trim()) payload.unit = itemUnit.value.trim();
  if (itemCategory.value) payload.category = itemCategory.value;
  if (itemBrand.value.trim()) payload.brand = itemBrand.value.trim();
  if (itemBarcode.value.trim()) payload.barcode = itemBarcode.value.trim();
  if (lookupImage.src && !lookupPreview.hidden) payload.image = lookupImage.src;

  setBusy(addSubmit, true, 'Sealing…', 'Seal it in the fridge');
  try {
    const created = await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
    fridgeItems.push(created);
    renderFridge();
    renderHauntings();
    addForm.reset();
    itemQuantity.value = '1';
    lookupPreview.hidden = true;
    lookupStatus.textContent = '';
    lookupStatus.className = 'field-note';
    itemName.focus();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  } finally {
    setBusy(addSubmit, false, '', 'Seal it in the fridge');
  }
});

/* ---------- Barcode lookup ---------- */
lookupBtn.addEventListener('click', async () => {
  const barcode = itemBarcode.value.trim();
  lookupPreview.hidden = true;
  lookupStatus.className = 'field-note';
  if (!barcode) {
    lookupStatus.textContent = 'Enter a barcode first.';
    lookupStatus.classList.add('missing');
    itemBarcode.focus();
    return;
  }
  setBusy(lookupBtn, true, 'Summoning…', 'Look up barcode');
  lookupStatus.textContent = 'Consulting Open Food Facts…';
  try {
    const data = await api(`/api/lookup?barcode=${encodeURIComponent(barcode)}`);
    if (!data || !data.found || !data.product) {
      lookupStatus.textContent = 'No product found for that barcode. Enter the name by hand.';
      lookupStatus.classList.add('missing');
      return;
    }
    const p = data.product;
    if (p.name) itemName.value = p.name;
    if (p.brand) itemBrand.value = p.brand;
    if (p.categories) {
      const cats = String(p.categories).split(',').map((c) => c.trim());
      const match = [...itemCategory.options].find((o) => o.value && cats.some((c) => c.toLowerCase().includes(o.value.toLowerCase())));
      if (match) itemCategory.value = match.value;
    }
    lookupName.textContent = p.name || 'Unnamed product';
    const meta = [];
    if (p.brand) meta.push(p.brand);
    if (p.categories) meta.push(p.categories);
    lookupMeta.textContent = meta.join(' · ');
    if (p.image) {
      lookupImage.src = p.image;
      lookupImage.alt = p.name ? `Photo of ${p.name}` : 'Product photo';
      lookupImage.hidden = false;
    } else {
      lookupImage.hidden = true;
      lookupImage.removeAttribute('src');
    }
    lookupPreview.hidden = false;
    lookupStatus.textContent = 'Product found — details filled in. Check the expiry date and seal it in.';
    lookupStatus.classList.add('found');
    itemExpiry.focus();
  } catch (err) {
    lookupStatus.textContent = `Lookup failed — ${err.message}`;
    lookupStatus.classList.add('missing');
  } finally {
    setBusy(lookupBtn, false, '', 'Look up barcode');
  }
});

/* ---------- Hauntings ---------- */
function renderHauntings() {
  hauntingsList.textContent = '';
  if (!hauntings.length) {
    hauntingsList.appendChild(emptyState('No spirits stirring. The fridge rests in peace… for now.'));
    return;
  }
  const order = { expired: 0, critical: 1, stirring: 2, resting: 3 };
  const sorted = [...hauntings].sort((a, b) => {
    const ua = a.urgency || urgencyFromDays(a.daysLeft);
    const ub = b.urgency || urgencyFromDays(b.daysLeft);
    if (order[ua] !== order[ub]) return order[ua] - order[ub];
    return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
  });
  for (const h of sorted) {
    const item = h.item || {};
    const urgency = h.urgency || urgencyFromDays(h.daysLeft);
    const days = h.daysLeft !== undefined && h.daysLeft !== null ? h.daysLeft : daysUntil(item.expiryDate);
    const row = el('div', 'haunting-row');
    row.appendChild(el('span', 'ghost-emoji', urgency === 'expired' ? '💀' : '👻'));
    row.appendChild(el('span', 'haunt-name', item.name || 'Unknown item'));
    row.appendChild(el('span', 'haunt-days', urgencyLabel(urgency, days)));
    row.appendChild(el('span', `badge ${urgencyClass(urgency)}`, urgency));
    hauntingsList.appendChild(row);
  }
}

async function loadHauntings() {
  hauntingsList.textContent = '';
  hauntingsList.appendChild(spinner());
  try {
    const days = hauntingDays.value || '3';
    const data = await api(`/api/hauntings?days=${encodeURIComponent(days)}`);
    hauntings = Array.isArray(data) ? data : [];
    renderHauntings();
  } catch (err) {
    hauntingsList.textContent = '';
    hauntingsList.appendChild(emptyState(`Could not summon the hauntings — ${err.message}`));
  }
}

hauntingDays.addEventListener('change', loadHauntings);

/* ---------- Recipes ---------- */
function expiringIngredientNames() {
  const days = parseInt(hauntingDays.value || '3', 10);
  const names = [];
  for (const item of fridgeItems) {
    const d = daysUntil(item.expiryDate);
    if (d !== null && d <= days && !names.includes(item.name)) names.push(item.name);
  }
  return names;
}

function renderRecipes(meals, note) {
  recipesList.textContent = '';
  if (note) recipesBasis.textContent = note;
  if (!meals || meals.length === 0) {
    recipesList.appendChild(emptyState('No recipes rose from the fridge. Try adding more expiring ingredients.'));
    return;
  }
  for (const meal of meals) {
    const card = el('article', 'recipe-card');

    if (meal.thumb) {
      const img = el('img');
      img.src = meal.thumb;
      img.alt = `Photo of ${meal.name || 'recipe'}`;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      card.appendChild(img);
    }

    const body = el('div', 'recipe-body');
    body.appendChild(el('h3', null, meal.name || 'Untitled recipe'));
    const tags = [meal.category, meal.area].filter(Boolean).join(' · ');
    if (tags) body.appendChild(el('p', 'recipe-tags', tags));

    if (Array.isArray(meal.ingredients) && meal.ingredients.length) {
      const list = el('ul', 'recipe-ingredients');
      const have = new Set(fridgeItems.map((i) => i.name.toLowerCase()));
      for (const ing of meal.ingredients) {
        const li = el('li', null, `${ing.name}${ing.measure ? ` — ${ing.measure}` : ''}`);
        if (have.has(String(ing.name).toLowerCase())) li.classList.add('have');
        list.appendChild(li);
      }
      body.appendChild(list);
    }

    if (meal.instructions) {
      const excerpt = meal.instructions.length > 280
        ? `${meal.instructions.slice(0, 280).trim()}…`
        : meal.instructions;
      body.appendChild(el('p', 'recipe-instructions', excerpt));
    }

    const addBtn = el('button', 'btn btn-ghost btn-small', 'Add missing ingredients to shopping list');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => addMissing(meal, addBtn, body));
    body.appendChild(addBtn);

    card.appendChild(body);
    recipesList.appendChild(card);
  }
}

async function addMissing(meal, button, body) {
  setBusy(button, true, 'Adding…', 'Add missing ingredients to shopping list');
  try {
    const data = await api(`/api/recipes/${encodeURIComponent(meal.id)}/add-missing`, { method: 'POST' });
    const added = Array.isArray(data.added) ? data.added : [];
    const already = Array.isArray(data.alreadyHave) ? data.alreadyHave : [];
    const note = el('p', 'recipe-added-note');
    const parts = [];
    if (added.length) parts.push(`Added ${added.length} to your shopping list: ${added.map((a) => a.name || a).join(', ')}`);
    if (already.length) parts.push(`Already in the fridge: ${already.map((a) => a.name || a).join(', ')}`);
    note.textContent = parts.length ? parts.join(' · ') : 'Nothing missing — you already have everything.';
    body.appendChild(note);
    await loadShoppingList();
  } catch (err) {
    showAlert(`Could not add missing ingredients — ${err.message}`);
  } finally {
    setBusy(button, false, '', 'Add missing ingredients to shopping list');
  }
}

suggestBtn.addEventListener('click', async () => {
  hideAlert();
  const names = expiringIngredientNames();
  if (!names.length) {
    recipesBasis.textContent = 'Nothing is expiring soon — add items with near expiry dates first.';
    recipesList.textContent = '';
    recipesList.appendChild(emptyState('No expiring ingredients to cook with yet.'));
    return;
  }
  recipesBasis.textContent = `Cooking with: ${names.join(', ')}`;
  recipesList.textContent = '';
  recipesList.appendChild(spinner());
  setBusy(suggestBtn, true, 'Summoning recipes…', 'Suggest recipes from what’s expiring');
  try {
    const data = await api(`/api/recipes?ingredients=${encodeURIComponent(names.join(','))}`);
    renderRecipes(data && data.meals, data && data.note);
  } catch (err) {
    recipesList.textContent = '';
    recipesList.appendChild(emptyState(`The recipes would not rise — ${err.message}`));
  } finally {
    setBusy(suggestBtn, false, '', 'Suggest recipes from what’s expiring');
  }
});

/* ---------- Shopping list ---------- */
function renderShoppingList() {
  shoppingListEl.textContent = '';
  if (!shoppingItems.length) {
    const li = el('li', 'empty-state', 'The list is empty. Nothing to summon.');
    shoppingListEl.appendChild(li);
    return;
  }
  for (const entry of shoppingItems) {
    const li = el('li', `shopping-item${entry.checked ? ' checked' : ''}`);
    li.dataset.id = entry.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!entry.checked;
    checkbox.setAttribute('aria-label', `Mark ${entry.name} as ${entry.checked ? 'not bought' : 'bought'}`);
    checkbox.addEventListener('change', () => toggleShoppingChecked(entry, checkbox));
    li.appendChild(checkbox);

    const nameWrap = el('span', 'shop-name');
    const qty = entry.quantity !== undefined && entry.quantity !== null && entry.quantity !== ''
      ? ` (${entry.quantity}${entry.unit ? ` ${entry.unit}` : ''})` : '';
    nameWrap.appendChild(document.createTextNode(`${entry.name}${qty}`));
    if (entry.reason) nameWrap.appendChild(el('span', 'shop-reason', entry.reason));
    li.appendChild(nameWrap);

    const del = el('button', 'btn btn-danger', 'Remove');
    del.type = 'button';
    del.setAttribute('aria-label', `Remove ${entry.name} from shopping list`);
    del.addEventListener('click', () => deleteShoppingEntry(entry.id, entry.name, del));
    li.appendChild(del);

    shoppingListEl.appendChild(li);
  }
}

async function loadShoppingList() {
  try {
    const data = await api('/api/shopping-list');
    shoppingItems = Array.isArray(data) ? data : [];
    renderShoppingList();
  } catch (err) {
    shoppingListEl.textContent = '';
    const li = el('li', 'empty-state', `Could not load the shopping list — ${err.message}`);
    shoppingListEl.appendChild(li);
  }
}

shoppingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  shoppingError.hidden = true;
  const name = shoppingName.value.trim();
  if (!name) {
    shoppingError.textContent = 'Item name is required.';
    shoppingError.hidden = false;
    shoppingName.focus();
    return;
  }
  const payload = { name };
  const qty = parseFloat(shoppingQuantity.value);
  if (!Number.isNaN(qty)) payload.quantity = qty;
  if (shoppingUnit.value.trim()) payload.unit = shoppingUnit.value.trim();
  try {
    const created = await api('/api/shopping-list', { method: 'POST', body: JSON.stringify(payload) });
    shoppingItems.push(created);
    renderShoppingList();
    shoppingForm.reset();
    shoppingName.focus();
  } catch (err) {
    shoppingError.textContent = err.message;
    shoppingError.hidden = false;
  }
});

async function toggleShoppingChecked(entry, checkbox) {
  // NOTE: the API contract has no PATCH/PUT for shopping entries and POST
  // does not accept a `checked` field, so a check toggle cannot be persisted
  // server-side. Toggle locally and re-render; the state resets on reload
  // until the backend adds an update endpoint. See final report.
  entry.checked = checkbox.checked;
  renderShoppingList();
}

async function deleteShoppingEntry(id, name, button) {
  button.disabled = true;
  try {
    await api(`/api/shopping-list/${encodeURIComponent(id)}`, { method: 'DELETE' });
    shoppingItems = shoppingItems.filter((s) => s.id !== id);
    renderShoppingList();
  } catch (err) {
    showAlert(`Could not remove “${name}” — ${err.message}`);
    button.disabled = false;
  }
}

/* ---------- Boot ---------- */
(async function init() {
  await checkHealth();
  await Promise.all([loadFridge(), loadHauntings(), loadShoppingList()]);
})();
