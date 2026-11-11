# FridgeGhost — Requirements

Kiroween 2026 · Devpost hackathon 31667 · Category: Frankenstein
Status: v1.0 (MVP scope) · Last updated: 2026-11-12

## Introduction

FridgeGhost helps households stop wasting food. Roughly a third of all food
produced is wasted, and a large share of that dies quietly in the home fridge:
bought with good intentions, forgotten, found too late. FridgeGhost makes the
fridge visible — what is in it, when each item dies, and what to cook with the
things about to become ghosts — then turns the answer into a shopping list.

The app is local-first: one command starts it, no account, no paid API keys,
no private data leaves the machine. It stitches together two free public APIs
(Open Food Facts for barcode lookup, TheMealDB for recipes) with a small
expiry engine and a shopping list, served through a plain web UI.

## Glossary

- **Item**: one grocery entry in the fridge (name, quantity, unit, expiry date,
  optional barcode, optional category, added date).
- **Haunting**: an item whose expiry date is today, tomorrow, or within the
  configured warning window (default 3 days), or already past.
- **Urgency**: `fresh` (> 3 days left), `soon` (1–3 days), `today` (expires
  today), `expired` (past expiry).
- **Recipe**: a meal from TheMealDB, with its ingredient list.
- **Missing ingredient**: a recipe ingredient the user does not currently have
  in the fridge.
- **Fridge store**: the local JSON file holding items.
- **Shopping list**: the local JSON file holding items to buy.

## Requirements

### 1. Manual grocery entry

**R1.1** — WHEN the user submits the add-item form with a name and an expiry
date, THE SYSTEM SHALL create an item with a unique id, the given name,
quantity (default 1), unit (default "pcs"), expiry date, category (optional),
and the current date as the added date.

- *Acceptance:* POST /api/items with `{name, expiryDate}` returns 201 and the
  created item; the item appears in GET /api/items.

**R1.2** — WHEN the user submits an item without a name or without an expiry
date, THE SYSTEM SHALL reject it with HTTP 400 and a human-readable error
message, and SHALL NOT create an item.

- *Acceptance:* POST /api/items with a missing name or missing expiryDate
  returns 400; GET /api/items is unchanged.

**R1.3** — WHEN the user submits an expiry date in the past, THE SYSTEM SHALL
accept it and mark the item `expired` (the user may be logging something they
just found dead).

- *Acceptance:* an item with yesterday's expiry date is stored and returned
  with urgency `expired`.

**R1.4** — WHEN the user deletes an item, THE SYSTEM SHALL remove it from the
fridge store and return 204; deleting a non-existent id SHALL return 404.

- *Acceptance:* DELETE /api/items/:id removes the item; a second delete of the
  same id returns 404.

### 2. Barcode lookup (Open Food Facts)

**R2.1** — WHEN the user enters a barcode, THE SYSTEM SHALL query the Open
Food Facts API (`https://world.openfoodfacts.org/api/v2/product/<barcode>.json`)
and return the product name (and brand, when present) so the add-item form can
be pre-filled.

- *Acceptance:* GET /api/lookup?barcode=3017620422003 returns a product name
  (e.g. a Nutella-family product) when the network is available.

**R2.2** — WHEN Open Food Facts has no product for a barcode, THE SYSTEM SHALL
return 404 with a clear message and SHALL NOT block manual entry.

- *Acceptance:* an unknown barcode returns 404; the user can still add the
  item by typing its name.

**R2.3** — WHEN the Open Food Facts API is unreachable or returns an error,
THE SYSTEM SHALL return 502 with a clear message, SHALL NOT crash, and SHALL
NOT lose any stored data.

- *Acceptance:* with the network down, GET /api/lookup returns 502 and the
  server stays up; existing items are still listed.

**R2.4** — WHEN a barcode lookup succeeds, THE SYSTEM SHALL NOT store anything
automatically; an item is created only when the user confirms the add form.

- *Acceptance:* a lookup alone does not change GET /api/items.

### 3. Expiry tracking and urgency warnings

**R3.1** — WHEN items are listed, THE SYSTEM SHALL compute for each item the
number of days until expiry and an urgency level: `fresh` (> 3 days), `soon`
(1–3 days), `today` (0 days), `expired` (< 0 days).

- *Acceptance:* an item expiring in 2 days is returned with urgency `soon`
  and daysLeft 2; an item expiring today has urgency `today`.

**R3.2** — WHEN the user opens the hauntings view, THE SYSTEM SHALL return all
items with urgency `soon`, `today`, or `expired`, sorted by expiry date
ascending (most urgent first).

- *Acceptance:* GET /api/hauntings returns only non-fresh items, nearest
  expiry first; fresh items are excluded.

**R3.3** — WHEN an item expires, THE SYSTEM SHALL keep it listed as `expired`
until the user deletes it; the system SHALL NOT auto-delete expired items.

- *Acceptance:* an item past its expiry date still appears in GET /api/items
  and in GET /api/hauntings until deleted.

**R3.4** — WHEN the fridge is empty or nothing is haunting, THE SYSTEM SHALL
return an empty list (not an error) and the UI SHALL say so plainly.

- *Acceptance:* GET /api/hauntings on an empty fridge returns `[]` with 200.

### 4. Recipe suggestions from expiring ingredients (TheMealDB)

**R4.1** — WHEN the user asks for recipes for one or more ingredients, THE
SYSTEM SHALL query TheMealDB (`https://www.themealdb.com/api/json/v1/1/filter.php?i=<ingredient>`)
and return matching meals (id, name, thumbnail).

- *Acceptance:* GET /api/recipes?ingredients=chicken returns a non-empty list
  of meals when the network is available.

**R4.2** — WHEN the user asks for recipes from their hauntings, THE SYSTEM
SHALL use the names of the haunting items as the ingredient query.

- *Acceptance:* the UI's "Cook the ghosts" action calls the recipes endpoint
  with the haunting item names and shows results.

**R4.3** — WHEN TheMealDB returns no meals for an ingredient, THE SYSTEM SHALL
return an empty list (not an error) and the UI SHALL say no recipes were found.

- *Acceptance:* an ingredient with no matches returns `[]` with 200.

**R4.4** — WHEN TheMealDB is unreachable or returns an error, THE SYSTEM SHALL
return 502 with a clear message and SHALL NOT crash.

- *Acceptance:* with the network down, GET /api/recipes returns 502 and the
  server stays up.

**R4.5** — WHEN the user selects a recipe, THE SYSTEM SHALL fetch its full
detail (ingredients with measures) from TheMealDB
(`lookup.php?i=<mealId>`) so missing ingredients can be computed.

- *Acceptance:* selecting a recipe shows its ingredient list with measures.

### 5. Shopping list

**R5.1** — WHEN the user adds an entry to the shopping list, THE SYSTEM SHALL
store it with a unique id, name, quantity (default 1), and a `checked` flag
defaulting to false.

- *Acceptance:* POST /api/shopping-list with `{name}` returns 201; the entry
  appears in GET /api/shopping-list.

**R5.2** — WHEN the user asks to add a recipe's missing ingredients, THE
SYSTEM SHALL compare the recipe's ingredient list against current fridge
items (case-insensitive name match) and add only the ingredients not present
in the fridge to the shopping list.

- *Acceptance:* POST /api/recipes/:id/add-missing adds exactly the ingredients
  absent from the fridge and returns the list of added entries.

**R5.3** — WHEN a missing ingredient is already on the shopping list, THE
SYSTEM SHALL NOT add a duplicate; it SHALL leave the existing entry untouched.

- *Acceptance:* calling add-missing twice for the same recipe adds no
  duplicates on the second call.

**R5.4** — WHEN the user deletes a shopping-list entry, THE SYSTEM SHALL
remove it and return 204; deleting a non-existent id SHALL return 404.

- *Acceptance:* DELETE /api/shopping-list/:id removes the entry; a second
  delete returns 404.

### 6. Local-first JSON storage

**R6.1** — WHEN the server starts, THE SYSTEM SHALL load items and the
shopping list from local JSON files under `data/` (creating the directory and
empty files when they do not exist).

- *Acceptance:* a fresh start creates `data/fridge.json` and
  `data/shopping-list.json`; the app works with no prior data.

**R6.2** — WHEN an item or shopping-list entry is created or deleted, THE
SYSTEM SHALL persist the change to the JSON file before responding, so a
restart does not lose data.

- *Acceptance:* add an item, restart the server, GET /api/items still returns
  it.

**R6.3** — WHEN the JSON data file is corrupt or unreadable, THE SYSTEM SHALL
start with an empty store, log the error, and SHALL NOT crash.

- *Acceptance:* a corrupted `data/fridge.json` still lets the server start
  and serve an empty fridge.

**R6.4** — THE SYSTEM SHALL store all data locally only; no item, barcode, or
shopping-list entry SHALL be sent to any third party except the barcode string
to Open Food Facts and the ingredient string to TheMealDB (both public
lookups, no identity attached).

- *Acceptance:* no analytics, tracking, or account calls exist in the code;
  the only outbound requests are the two documented public APIs.

### 7. One-command local run

**R7.1** — WHEN the user runs `npm install && npm run dev`, THE SYSTEM SHALL
build the TypeScript, start the server, and serve the UI at
`http://localhost:3000` with no further configuration.

- *Acceptance:* from a clean checkout, `npm install && npm run dev` serves
  the UI and `GET /api/health` returns 200 within seconds.

**R7.2** — WHEN the server is running, THE SYSTEM SHALL respond to
GET /api/health with 200 and `{ "status": "ok" }`.

- *Acceptance:* `curl http://localhost:3000/api/health` returns 200 and
  `{"status":"ok"}`.

**R7.3** — THE SYSTEM SHALL run on Node.js >= 18 with no other runtime
dependency (no database, no external service to install).

- *Acceptance:* the only prerequisites are Node.js 18+ and npm.

## Non-functional requirements

**N1 — No paid keys.** THE SYSTEM SHALL use only free, keyless public APIs
(Open Food Facts, TheMealDB). No API key, token, or secret SHALL be required
to run the app, and none SHALL be committed to the repository.

**N2 — No accounts.** THE SYSTEM SHALL NOT require sign-up, sign-in, or any
user identity. There is no user model.

**N3 — Privacy.** No personal data SHALL leave the machine except the two
public lookups in R6.4. There SHALL be no analytics, telemetry, or third-party
scripts in the frontend.

**N4 — Graceful API failure.** WHEN either public API is down, slow, or
returns an error, THE SYSTEM SHALL degrade gracefully: the fridge, hauntings,
and shopping list keep working; only the lookup/recipe feature that depends on
the failed API reports an error (see R2.3, R4.4).

**N5 — Responsiveness.** API calls to Open Food Facts and TheMealDB SHALL have
a timeout (10 seconds) so a hung upstream cannot hang the server.

**N6 — Type safety.** The server code SHALL be TypeScript with `strict: true`
and SHALL compile with zero errors (`npm run build`).

**N7 — Single-file data.** The fridge and shopping list SHALL each be one
human-readable JSON file so the user can inspect, back up, or edit their data
with any text editor.

**N8 — Portability.** The app SHALL run identically on macOS, Linux, and
Windows from the same checkout, with the port configurable via the `PORT`
environment variable (default 3000).
