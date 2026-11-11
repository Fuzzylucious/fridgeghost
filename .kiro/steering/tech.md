# FridgeGhost — Tech Steering

## Stack

- **Runtime:** Node.js >= 18 (uses built-in `fetch` and `crypto.randomUUID`).
- **Language:** TypeScript, `strict: true`. `npm run build` (tsc) must pass
  with zero errors before any commit.
- **Server:** Node's built-in `http` module. No web framework (no Express,
  no Fastify). Routing is a small explicit table in `src/server.ts`.
- **Frontend:** Vanilla HTML/CSS/JS in `public/`. No framework, no bundler,
  no third-party scripts. The page talks to the API with `fetch()` only.
- **Storage:** Two local JSON files under `data/` (`fridge.json`,
  `shopping-list.json`). No database. Writes are atomic (temp file + rename).
- **Dependencies:** TypeScript + `@types/node` only. Nothing else.

## Free APIs only

- **Open Food Facts** — barcode lookup.
  `https://world.openfoodfacts.org/api/v2/product/<barcode>.json`
  Free, no key. Send a descriptive `User-Agent`.
- **TheMealDB** — recipes.
  `https://www.themealdb.com/api/json/v1/1/filter.php?i=<ingredient>` and
  `lookup.php?i=<mealId>`. Free, no key.

Rules:

- Never add an API that needs a key, a signup, or payment.
- Never add a dependency that phones home (analytics, telemetry, fonts that
  track — system fonts or self-hosted only; if a Google Font is referenced it
  must degrade gracefully offline and must not be load-bearing).
- All upstream calls go through the server (not the browser), with a 10-second
  timeout (`AbortSignal.timeout(10_000)`), and failures map to HTTP 502 with
  a clear message. The server never crashes because an upstream is down.

## Secrets

- **There are no secrets in this project.** No API keys, no tokens, no
  credentials of any kind are needed to run FridgeGhost.
- Never commit a `.env` file (`.gitignore` covers `.env` and `.env.*`).
- Never paste a real key, token, or password into code, docs, or commit
  messages — even "temporarily".
- If a future feature ever needs a key, it must come from an environment
  variable, never from a committed file.

## Code conventions

- TypeScript `strict` — no `any` without a comment saying why; prefer
  narrow types and explicit return types on exported functions.
- Pure logic (expiry math, urgency, merging/deduping) lives in modules with
  no I/O (`src/expiry.ts`) so it stays testable without a server.
- I/O (file store, HTTP clients) is isolated in its own modules
  (`src/store.ts`, `src/off/*`).
- Handlers validate input first, then touch the store, then persist before
  responding. Never respond success before the write lands.
- Errors are JSON: `{ "error": "<human-readable message>" }`, with the right
  status code (400 validation, 404 not found, 502 upstream, 500 store).
- Dates are `YYYY-MM-DD` calendar dates; `daysLeft` counts whole local days
  (midnight to midnight), so "expires today" is 0 no matter the time.
- Keep the dependency footprint at zero runtime dependencies. If a new
  dependency is proposed, justify it in the PR/commit message or don't add it.
