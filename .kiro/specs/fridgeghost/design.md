# FridgeGhost — Design

Kiroween 2026 · Devpost hackathon 31667 · Category: Frankenstein
Status: v1.0 (MVP scope) · Last updated: 2026-11-12
Companion docs: `requirements.md`, `tasks.md`, `../../steering/`

## Overview

FridgeGhost is a small local-first web app. One Node.js process serves a
static vanilla-JS frontend and a JSON API. The server is built on Node's
built-in `http` module — no web framework — so the dependency footprint is
TypeScript plus `@types/node` only. All state lives in two JSON files under
`data/`. Two free public APIs are stitched in: Open Food Facts (barcode →
product name) and TheMealDB (ingredient → recipes). The "Frankenstein" is
exactly this stitching: five parts that were never meant to live together —
a barcode database, a recipe database, an expiry engine, a fridge store, and
a shopping list — bolted into one app that runs with one command.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (vanilla HTML/CSS/JS, no framework, no third-party JS) │
│  fridge view · hauntings view · add-item form · recipes view    │
│  shopping-list view                                             │
└──────────────────────────────┬──────────────────────────────────┘
                               │ fetch() JSON
┌──────────────────────────────▼──────────────────────────────────┐
│ Node.js + TypeScript server (built-in http, src/server.ts)      │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Router       │  │ Expiry engine    │  │ Fridge store      │  │
│  │ (route table │  │ daysLeft +       │  │ data/fridge.json  │  │
│  │  + JSON body │  │ urgency +        │  │ (load/save,       │  │
│  │  parsing)    │  │ hauntings sort   │  │  atomic write)    │  │
│  └──────┬───────┘  └──────────────────┘  └───────────────────┘  │
│         │              ┌───────────────────┐  ┌────────────────┐ │
│         │              │ Shopping store    │  │ Open Food      │ │
│         ├──────────────► data/shopping-    │  │ Facts client   │ │
│         │              │ list.json         │  │ (fetch, 10s    │ │
│         │              └───────────────────┘  │  timeout)      │ │
│         │              ┌───────────────────┐  └────────────────┘ │
│         └──────────────► TheMealDB client  │  ┌────────────────┐ │
│                        │ (filter + lookup, │  │ Static file    │ │
│                        │  10s timeout)     │  │ server (public/│ │
│                        └───────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | File | Responsibility |
|---|---|---|
| Server / router | `src/server.ts` | HTTP server, route dispatch, JSON body parsing, static file serving, error mapping to status codes |
| Fridge store | `src/store.ts` | Load/save `data/fridge.json`; CRUD for items; id generation |
| Shopping store | `src/store.ts` | Load/save `data/shopping-list.json`; CRUD for entries; duplicate check |
| Expiry engine | `src/expiry.ts` | `daysLeft(expiryDate)`, `urgency(daysLeft)`, `hauntings(items)` sorted ascending by expiry |
| Open Food Facts client | `src/off/openfoodfacts.ts` | `lookupBarcode(barcode)` → `{ name, brand? } \| null`; 10 s timeout; maps network/HTTP errors to a typed `UpstreamError` |
| TheMealDB client | `src/off/themealdb.ts` | `searchByIngredient(ingredient)` → meals; `getMeal(id)` → meal detail with ingredients+measures; 10 s timeout |
| Frontend | `public/index.html`, `public/app.js`, `public/styles.css` | All views; talks to the API only; no third-party scripts |
| Types | `src/store.ts`, `src/off/themealdb.ts` | Shared interfaces (`FridgeItem`, `ShoppingEntry`, `MealSummary`, `MealDetail`) live with the modules that own them; there is no separate `src/types.ts` in the as-built MVP |

> As-built note (2026-11-12): the API contract lists `GET /api/recipes/:id`
> as a standalone endpoint, but the built server fetches meal detail
> server-side inside `GET /api/recipes` and inside `add-missing` instead
> (via `getMealById`). Either add the route or drop it from the contract
> before submission.

### Data flow

1. **Add item (manual):** form → `POST /api/items` → validate (R1.2) →
   store appends + persists (R6.2) → 201 with item (urgency computed on read).
2. **Add item (barcode):** barcode input → `GET /api/lookup?barcode=` →
   Open Food Facts client → name/brand → form pre-filled → user confirms →
   same flow as (1). Lookup never writes (R2.4).
3. **Hauntings:** `GET /api/hauntings` → store loads items → expiry engine
   filters urgency != `fresh`, sorts by expiry ascending → JSON.
4. **Recipes:** user picks haunting ingredients (or types one) →
   `GET /api/recipes?ingredients=a,b` → TheMealDB client, one `filter.php`
   call per ingredient, results merged and deduplicated by meal id → JSON.
   Selecting a meal calls TheMealDB `lookup.php` server-side only when
   computing missing ingredients.
5. **Add missing:** `POST /api/recipes/:id/add-missing` → fetch meal detail →
   compare ingredient names against fridge item names (case-insensitive,
   trimmed) → append absent ones to shopping list (skip duplicates, R5.3) →
   persist → return added entries.
6. **Shopping list:** standard CRUD against `data/shopping-list.json`.

### Data models

```ts
interface FridgeItem {
  id: string;            // crypto.randomUUID()
  name: string;
  quantity: number;      // default 1
  unit: string;          // default "pcs"
  expiryDate: string;    // ISO date, "YYYY-MM-DD"
  category?: string;
  barcode?: string;
  addedAt: string;       // ISO timestamp
}

type Urgency = "fresh" | "soon" | "today" | "expired";

interface FridgeItemView extends FridgeItem {
  daysLeft: number;      // negative when expired
  urgency: Urgency;
}

interface ShoppingEntry {
  id: string;
  name: string;
  quantity: number;      // default 1
  checked: boolean;      // default false
  addedAt: string;
}

interface MealSummary { id: string; name: string; thumbnail: string; }
interface MealDetail extends MealSummary {
  ingredients: { name: string; measure: string }[];
  instructions: string;
}
```

Storage files are plain JSON arrays (`FridgeItem[]`,
`ShoppingEntry[]`) — human-readable, editable, backed up by copying the
file (N7).

## API contract

Base URL: `http://localhost:3000` (port via `PORT`, default 3000). All
responses are JSON. `Content-Type: application/json` on requests with a body.

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/health` | — | 200 `{ "status": "ok" }` | — |
| `GET /api/items` | — | 200 `FridgeItemView[]` (all items, urgency + daysLeft computed) | 500 on store failure |
| `POST /api/items` | `{ name, expiryDate, quantity?, unit?, category?, barcode? }` | 201 `FridgeItemView` | 400 missing/invalid name or expiryDate |
| `DELETE /api/items/:id` | — | 204 (no body) | 404 unknown id |
| `GET /api/lookup?barcode=` | query param `barcode` (digits) | 200 `{ "name", "brand"? }` | 400 missing barcode; 404 not in Open Food Facts; 502 upstream failure |
| `GET /api/hauntings` | — | 200 `FridgeItemView[]` (urgency != fresh, expiry ascending) | 500 on store failure |
| `GET /api/recipes?ingredients=` | query param `ingredients` (comma-separated) | 200 `MealSummary[]` (deduped by id) | 400 missing param; 502 upstream failure |
| `GET /api/recipes/:id` | — | 200 `MealDetail` | 404 unknown meal; 502 upstream failure |
| `POST /api/recipes/:id/add-missing` | — | 200 `{ "added": ShoppingEntry[] }` | 404 unknown meal; 502 upstream failure |
| `GET /api/shopping-list` | — | 200 `ShoppingEntry[]` | 500 on store failure |
| `POST /api/shopping-list` | `{ name, quantity? }` | 201 `ShoppingEntry` | 400 missing name |
| `DELETE /api/shopping-list/:id` | — | 204 (no body) | 404 unknown id |

Notes:

- `GET /api/recipes` accepts one ingredient per TheMealDB call; the server
  fans out one call per comma-separated ingredient and merges results.
  (TheMealDB `filter.php` takes a single ingredient.)
- `POST /api/recipes/:id/add-missing` is idempotent with respect to the
  shopping list: re-running it adds nothing new (R5.3).
- Unknown routes return 404 JSON `{ "error": "not found" }`; malformed JSON
  bodies return 400 `{ "error": "invalid JSON" }`.

## Error handling

- **Validation errors (400):** missing/empty `name`, missing or unparseable
  `expiryDate`, missing `barcode` / `ingredients` query param. Message names
  the missing field.
- **Not found (404):** unknown item/shopping/meal id; barcode absent from
  Open Food Facts (R2.2).
- **Upstream failure (502):** Open Food Facts or TheMealDB unreachable,
  non-2xx, timeout (> 10 s), or unparseable response. Body:
  `{ "error": "barcode service unavailable" }` or
  `{ "error": "recipe service unavailable" }`. The server stays up and local
  features keep working (N4).
- **Store failure (500):** JSON file unreadable in an unexpected way or write
  failure. Corrupt data files fall back to an empty store with a logged
  warning instead (R6.3); 500 is reserved for failures after that fallback.
- **Crash safety:** no `throw` escapes a request handler; the router wraps
  handlers and maps unknown errors to 500 JSON. `fetch` calls use
  `AbortSignal.timeout(10_000)`.
- **Writes:** store saves are atomic — write to a temp file in `data/`, then
  rename over the real file — so a crash mid-write cannot corrupt the store.

## Testing approach

No test framework is installed for the MVP (dependency footprint stays at
TypeScript + `@types/node`). Verification is a manual smoke-test script plus
type checking:

1. **`npm run build`** (tsc, strict) must pass with zero errors — this is the
   pre-commit hook and the CI-equivalent gate.
2. **Smoke test** (`scripts/smoke.sh` or manual curl sequence, run against a
   temp `data/` dir):
   - `GET /api/health` → 200 `{"status":"ok"}`
   - `POST /api/items` (valid) → 201; (missing name) → 400
   - `GET /api/items` lists the item with correct `daysLeft`/`urgency`
   - item expiring in 2 days appears in `GET /api/hauntings`; fresh item does not
   - `DELETE /api/items/:id` → 204, second delete → 404
   - `GET /api/lookup?barcode=3017620422003` → 200 with a name (network up)
   - `GET /api/recipes?ingredients=chicken` → 200 non-empty (network up)
   - `POST /api/shopping-list` → 201; `POST /api/recipes/:id/add-missing`
     adds only missing ingredients and adds nothing on repeat
   - restart the server → items and shopping list survive (R6.2)
   - corrupt `data/fridge.json` → server still starts, fridge is empty (R6.3)
3. **Failure-mode checks:** with network disabled, lookup/recipes return 502
   and the fridge still works (N4).
4. **Future work (post-MVP):** add a real test runner (e.g. `node:test`) with
   unit tests for `expiry.ts` (boundary days: -1, 0, 1, 3, 4) and the store's
   atomic write, plus mocked-`fetch` tests for both API clients.

## Decisions and trade-offs

- **Built-in `http`, no framework:** keeps the install tiny and the
  Frankenstein stitching visible; routing is a small explicit table.
- **JSON files, no database:** the data is a household's fridge — a few dozen
  rows. Files are inspectable and survive without any service (N7, R7.3).
- **Server-side API calls, not browser-side:** keeps the frontend free of CORS
  issues and API keys (none needed), and lets the server enforce timeouts and
  error mapping in one place.
- **Urgency computed on read, not stored:** expiry is a function of "today",
  so storing it would go stale; computing per request is always correct.
- **One ingredient per TheMealDB call:** the public API only supports a single
  `i=` parameter; merging server-side keeps the frontend simple.
