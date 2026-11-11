# FridgeGhost — Implementation Tasks

Kiroween 2026 · Devpost hackathon 31667 · Category: Frankenstein
Status: v1.0 (MVP scope) · Last updated: 2026-11-12
Companion docs: `requirements.md`, `design.md`

> How to read this list: items are sequenced — finish a phase before starting
> the next. An item is marked `[x]` only when the file it names exists on disk
> and has been verified (non-empty, real implementation). Items left `[ ]`
> were not verifiable at the time this file was written; check them off as the
> work lands. Verified 2026-11-12 during the spec/docs workstream.

## Phase 1 — Project scaffold

- [x] Initialise repo: `package.json` (name `fridgeghost`, scripts `build`/`dev`/`start`), `tsconfig.json` (strict), `.gitignore` (`node_modules/`, `dist/`, `data/`, `.env` — `.kiro/` explicitly NOT ignored), `LICENSE` (MIT)
- [x] Create Kiro spec-driven structure: `.kiro/specs/fridgeghost/{requirements,design,tasks}.md`, `.kiro/steering/{product,tech,structure}.md`, `.kiro/hooks/hooks.json`
- [x] Write `README.md` (pitch, features, quickstart, API summary, Kiroween context) and `docs/KIRO_USAGE.md` (honest Kiro usage write-up)

## Phase 2 — Core types and expiry engine

- [ ] Create `src/types.ts` — shared interfaces: `FridgeItem`, `FridgeItemView` (with `daysLeft`, `urgency`), `ShoppingEntry`, `MealSummary`, `MealDetail` — NOTE (verified 2026-11-12): no separate `types.ts` exists; the types live inline in `src/store.ts` (`FridgeItem`, `ShoppingEntry`) and the meal types in `src/off/themealdb.ts`. Either extract them into `src/types.ts` or update this item to match the as-built layout.
- [x] Create `src/expiry.ts` — pure helpers: `daysLeft(expiryDate)` in whole local-calendar days, `urgency(daysLeft)` (`fresh`/`soon`/`today`/`expired`), `hauntings(items)` filtered + sorted by expiry ascending
- [ ] Unit-check the expiry boundaries by hand: daysLeft -1 → `expired`, 0 → `today`, 1 and 3 → `soon`, 4 → `fresh`

## Phase 3 — Local JSON storage

- [x] Create `src/store.ts` — load/save `data/fridge.json` and `data/shopping-list.json`; create `data/` + empty files on first run; atomic write via temp file + rename; corrupt file falls back to an empty store with a logged warning
- [ ] Verify persistence: add an item, restart the server, confirm the item survives (R6.2)

## Phase 4 — Free API clients

- [x] Create `src/off/openfoodfacts.ts` — `lookupBarcode(barcode)` against `world.openfoodfacts.org`, descriptive User-Agent, 10 s timeout, typed `UpstreamError` on failure
- [x] Create `src/off/themealdb.ts` — `searchByIngredient(ingredient)` (`filter.php`) and `getMeal(id)` (`lookup.php`), 10 s timeout, typed `UpstreamError` on failure
- [ ] Live-check both clients: known barcode returns a product name; `chicken` returns meals; unknown barcode/ingredient handled per spec (404 / empty list)

## Phase 5 — HTTP server and API

- [x] Create `src/server.ts` — built-in `http` server; route table for all endpoints in the design doc's API contract; JSON body parsing; static file serving from `public/`; `PORT` env var (default 3000)
- [x] Implement `GET /api/health` → 200 `{"status":"ok"}`
- [x] Implement `GET /api/items` and `POST /api/items` (validate name + expiryDate → 400; urgency/daysLeft computed on read)
- [x] Implement `DELETE /api/items/:id` (204; 404 on unknown id)
- [x] Implement `GET /api/lookup?barcode=` (400 missing barcode; 404 not found; 502 upstream failure)
- [x] Implement `GET /api/hauntings` (non-fresh only, expiry ascending)
- [x] Implement `GET /api/recipes?ingredients=` (fan out one TheMealDB call per ingredient, merge + dedupe by meal id; 400 missing param; 502 upstream failure)
- [ ] Implement `GET /api/recipes/:id` (full meal detail; 404 unknown meal) — NOTE (verified 2026-11-12): no standalone route exists in `src/server.ts`; meal detail is fetched server-side inside the `GET /api/recipes` list handler and inside `add-missing` via `getMealById`. Either add the route or remove it from the API contract.
- [x] Implement `POST /api/recipes/:id/add-missing` (compare against fridge names case-insensitively, add only absent + not-already-listed ingredients, return added entries)
- [x] Implement `GET /api/shopping-list`, `POST /api/shopping-list` (400 missing name), `DELETE /api/shopping-list/:id` (204; 404 unknown)
- [x] Verify `npm run build` (tsc strict) passes with zero errors — verified 2026-11-12, exit 0, `dist/` emitted

## Phase 6 — Frontend

- [x] Create `public/index.html` — fridge view, hauntings view, add-item form (manual + barcode), recipes view, shopping-list view
- [x] Create `public/styles.css` — dark cellar / candle-glow styling, responsive, no external dependencies required
- [x] Create `public/app.js` — vanilla JS: fetch wrapper for the API, render fridge + hauntings with urgency badges, barcode lookup pre-fill, "Cook the ghosts" recipe flow, add-missing-to-list, shopping-list add/delete/check (verified present, 22 KB, contains lookup + add-missing flows)
- [ ] Verify the UI works end-to-end in a browser against a running server (all views, no console errors, no third-party requests)

## Phase 7 — Verification and submission prep

- [ ] Run the full smoke test from `design.md` (health, CRUD, validation, hauntings, lookup, recipes, add-missing idempotency, restart persistence, corrupt-file fallback)
- [ ] Run the failure-mode check: with network disabled, lookup/recipes return 502 and the fridge still works
- [ ] Run one-command check from a clean checkout: `npm install && npm run dev`, open `http://localhost:3000`
- [ ] Confirm no secrets in the repo (`grep -ri` for keys/tokens; `.env` ignored; no credentials in code)
- [ ] Confirm `git check-ignore .kiro/specs/fridgeghost/requirements.md` prints nothing (`.kiro/` is submittable)
- [ ] Record a < 3 minute demo video and write the Devpost submission (public GitHub repo with `/.kiro` at root, working app URL, description, Kiro usage write-up)

## Out of scope for the MVP (do not build)

- [ ] User accounts, sign-in, or any server-side identity
- [ ] Paid APIs or API keys of any kind
- [ ] Push notifications / email reminders
- [ ] Multi-household sync or cloud backup
- [ ] Native mobile app
- [ ] Automated test framework (manual smoke test only for the MVP; `node:test` suite is post-MVP work)
