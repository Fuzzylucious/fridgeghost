# FridgeGhost 👻

**Exorcise your fridge before your food becomes a ghost.**

FridgeGhost is a local-first web app that stops groceries dying forgotten in
the fridge. Add what you bought — by hand or by scanning a barcode — get
warned before it expires, cook the things that are about to become ghosts,
and turn whatever a recipe is missing into a shopping list.

Built for **Kiroween 2026** (Devpost hackathon 31667), category
**Frankenstein**: five parts that were never meant to live together — Open Food
Facts, TheMealDB, an expiry engine, a fridge store, and a shopping list —
stitched into one app that runs with a single command.

## The problem

Roughly a third of all food produced is wasted, and a large share of that
waste happens at home: groceries bought with good intentions, forgotten behind
the milk, found weeks too late. The fridge is a black box. FridgeGhost makes
it visible — what's in there, when each thing dies, and what to cook tonight
so nothing becomes a ghost.

## Features

- **Add groceries** — manual entry (name, quantity, expiry date) or barcode
  lookup via the free [Open Food Facts](https://world.openfoodfacts.org/) API
  (no key, no account).
- **Hauntings** — items expiring soon, today, or already past are surfaced as
  "hauntings", most urgent first, with a clear urgency badge
  (`fresh` / `soon` / `today` / `expired`).
- **Cook the ghosts** — recipe suggestions built from your expiring
  ingredients via the free [TheMealDB](https://www.themealdb.com/) API
  (no key, no account).
- **Shopping list** — add items manually, or add exactly the ingredients a
  recipe needs that you don't already have. No duplicates, ever.
- **Local-first** — your fridge lives in two JSON files on your machine
  (`data/fridge.json`, `data/shopping-list.json`). No account, no cloud,
  no tracking, no data leaving your machine except the two public lookups.

## Stack

- Node.js >= 18 + TypeScript (`strict: true`), built-in `http` server — no web
  framework, zero runtime dependencies
- Vanilla HTML/CSS/JS frontend — no framework, no bundler, no third-party
  scripts
- Open Food Facts (barcode → product) and TheMealDB (ingredient → recipes) —
  both free and keyless

## Quickstart

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. That's the whole setup — no database, no
services, no keys. The port can be changed with the `PORT` environment
variable.

## Hosted version (GitHub Pages)

The same app runs with no server at all: the frontend detects whether a
`/api` backend answers, and when there isn't one it switches to static mode
— fridge + shopping list in `localStorage`, barcode and recipe lookups
straight from the browser to Open Food Facts and TheMealDB (both are
CORS-open, no keys). See `public/static-store.js` for the no-server twin of
the backend. The live site is deployed from `public/` on the `gh-pages`
branch (GitHub Pages).

Other scripts:

```bash
npm run build   # typecheck with tsc (strict); must pass before commit
npm start       # run the compiled server from dist/
```

## API summary

Base URL: `http://localhost:3000`. All responses are JSON.

| Method & path | What it does |
|---|---|
| `GET /api/health` | `200 {"status":"ok"}` |
| `GET /api/items` | List fridge items (with `daysLeft` + `urgency`) |
| `POST /api/items` | Add an item (`name`, `expiryDate` required) |
| `DELETE /api/items/:id` | Remove an item |
| `GET /api/lookup?barcode=` | Product name for a barcode (Open Food Facts) |
| `GET /api/hauntings` | Items expiring soon / today / expired, most urgent first |
| `GET /api/recipes?ingredients=a,b` | Recipe suggestions for ingredients (TheMealDB) |
| `POST /api/recipes/:id/add-missing` | Add the recipe's missing ingredients to the shopping list |
| `GET /api/shopping-list` | List shopping entries |
| `POST /api/shopping-list` | Add a shopping entry |
| `DELETE /api/shopping-list/:id` | Remove a shopping entry |

Upstream failures (Open Food Facts / TheMealDB down) return HTTP 502 with a
clear message; the fridge, hauntings, and shopping list keep working.

## Project layout

```
.kiro/specs/fridgeghost/   # requirements, design, tasks (spec-driven dev)
.kiro/steering/            # product / tech / structure guidance for the agent
.kiro/hooks/               # agent hooks (typecheck + no-secrets)
docs/KIRO_USAGE.md         # honest write-up of how Kiro was used
public/                    # vanilla frontend
src/                       # TypeScript server
data/                      # your fridge + shopping list (gitignored)
```

## Kiroween 2026

FridgeGhost was built for Kiroween 2026, Frankenstein category: take existing
parts and stitch them into something new. The stitching is the product — a
barcode database and a recipe database were never designed to talk to a fridge,
but together with a small expiry engine they answer the only question that
matters at 7pm: *what do I cook tonight so nothing goes to waste?*

See [`docs/KIRO_USAGE.md`](docs/KIRO_USAGE.md) for an honest account of how
Kiro was used in building this repo.

## License

MIT — see [LICENSE](LICENSE).
