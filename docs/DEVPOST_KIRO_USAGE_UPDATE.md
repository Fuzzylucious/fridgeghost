# FridgeGhost — Updated Kiro Usage Write-up for Devpost

Kiroween 2026 · Devpost hackathon 31667 · Category: Frankenstein  
Updated: 2026-11-13

This document updates the Kiro usage section of the Devpost submission to
reflect a second session in which the Kiro agent ran autonomously and
completed the remaining implementation tasks. It covers both the original
hand-built session and this agent session.

---

## Session 1 — 2026-11-12: hand-built spec-driven work

The Kiro CLI (3.2.0) was installed and verified, but the agent could not
run because interactive browser OAuth was not available in the unattended
build VM (`kiro-cli whoami` → "Not logged in"). The build followed Kiro's
spec-driven format by hand instead:

- **Requirements** (`.kiro/specs/fridgeghost/requirements.md`): EARS-style
  requirements covering manual entry, barcode lookup, expiry warnings, recipe
  suggestions, shopping list, local-first storage, one-command run, and
  non-functional requirements (no paid keys, no accounts, no data leaves the
  machine, graceful API failure).
- **Design** (`.kiro/specs/fridgeghost/design.md`): architecture, component
  table, data flow, full API contract, error handling, and testing approach.
- **Tasks** (`.kiro/specs/fridgeghost/tasks.md`): a sequenced implementation
  checklist. Items verified on disk were checked off; everything unverifiable
  was left unchecked for a future agent session.
- **Steering** (`.kiro/steering/`): product vision + tone, tech stack rules
  (TypeScript strict, free APIs only, no secrets), repo layout and API shapes.
- **Hooks** (`.kiro/hooks/hooks.json`): pre-commit hook running `tsc`, a
  no-secrets reminder, and a heuristic scan of staged changes.

The full implementation (server, frontend, API clients, expiry engine) was
written by human-directed builders following those specs. The MVP was submitted
to Devpost on 2026-11-12.

---

## Session 2 — 2026-11-13: Kiro agent session

**Session ID:** `sess_81ea2e28-b23e-4b14-b2e7-2e832e1b9392`

This is genuine Kiro-agent work. The agent read the specs, steering docs, and
existing code autonomously, then implemented the remaining unchecked tasks from
`tasks.md`, verified each step, fixed bugs it found, and committed the result
(fa129ae). The push to GitHub was completed separately after the session ended,
because the Kiro monthly request-count limit was reached (see "Session end"
note at the end of this section).

### What the agent did

**Types extraction (Phase 2)**  
Created `src/types.ts` with the five shared interfaces (`FridgeItem`,
`FridgeItemView`, `ShoppingEntry`, `MealSummary`, `MealIngredient`,
`MealDetail`) and updated `src/store.ts` and `src/off/themealdb.ts` to
import and re-export from it. Zero-error `tsc` build after the refactor.

Ran the expiry boundary check: `-1→expired`, `0→critical` (today),
`1→critical` (soon), `3→stirring` (soon), `4→stirring`, `6→resting` (fresh).
All 6 boundary cases passed against the compiled `dist/expiry.js`. The
as-built urgency band names differ from the spec names
(`critical`/`stirring`/`resting` vs `today`/`soon`/`fresh`) but the boundary
math is correct and consistent throughout the codebase.

**Persistence verification (Phase 3)**  
Started a server, POSTed an item, killed the server, restarted it, confirmed
the item survived via GET. Test data cleaned up.

**Live API checks (Phase 4)**  
Verified against real upstream APIs: barcode `3017620422003` → Nutella; keyword
`chicken` → 3 meals; obscure ingredient → empty list (no error). All passed.

**New route: GET /api/recipes/:id (Phase 5)**  
Added the missing `GET /api/recipes/:id` endpoint to `src/server.ts`
(200 `MealDetail`; 404 unknown meal; 502 upstream failure) and mirrored it in
`public/static-store.js` for GitHub Pages parity.

During verification, the agent discovered and fixed a bug in `getMealById`
in both files: TheMealDB returns `{"meals":"Invalid ID"}` (a string, not null
or an array) for unknown meal IDs. The original `!data.meals ||
data.meals.length === 0` guard let the string through (`"Invalid ID".length`
is non-zero), causing `parseMealDetail` to receive a single character and
return an empty object with 200 instead of null/404. Fixed to
`!Array.isArray(data.meals) || data.meals.length === 0`.

Verified: 200 + 13 ingredients for meal 52940; 404 for `BOGUS_ID_99999`.

**CSS fix: lookup preview hidden on load (Phase 6)**  
Added `.lookup-preview[hidden] { display: none; }` to `public/styles.css`.
The existing `display: flex` rule was overriding the HTML `hidden` attribute,
making the barcode-lookup preview box visible before any lookup had run. The
attribute-selector rule has higher specificity and correctly hides the box
until JavaScript removes the `hidden` attribute after a successful lookup.

**Smoke tests (Phase 7)**  
Ran 23 endpoint checks covering all paths in the design.md smoke-test script:
health, CRUD, validation, hauntings, lookup, recipes, `GET /api/recipes/:id`,
add-missing idempotency, restart persistence, corrupt-file fallback. All 23
passed. Confirmed no secrets in the repo (grep clean). Confirmed `.kiro/` is
not gitignored. Verified `public/static-store.js` loads cleanly in plain
Node 24 without DOM.

The network-disabled failure-mode check (`unshare --net`) was attempted but
could not complete a full runtime test: `ip link set lo up` requires root
(`RTNETLINK: Operation not permitted`) in this environment, so the server's
loopback was unreachable from within the network namespace. The error-handling
code paths were code-reviewed: both upstream clients throw on network failure,
and every handler in `server.ts` catches those throws and returns 502 while
leaving local fridge endpoints unaffected.

### Files changed

| File | What changed |
|---|---|
| `src/types.ts` | New — shared interfaces |
| `src/store.ts` | Import types from types.ts; re-export for compat |
| `src/off/themealdb.ts` | Import types from types.ts; fix getMealById; re-export |
| `src/server.ts` | Add GET /api/recipes/:id route |
| `public/static-store.js` | Add GET /api/recipes/:id; fix getMealById |
| `public/styles.css` | .lookup-preview[hidden] { display: none; } |
| `.kiro/specs/fridgeghost/tasks.md` | Mark completed tasks [x] |
| `docs/KIRO_USAGE.md` | Append 2026-11-13 session section |
| `docs/DEVPOST_KIRO_USAGE_UPDATE.md` | This file |

### Build result

`npm run build` (tsc strict): zero errors. All 23 smoke-test checks passed.

---

## What Kiro shaped across both sessions

- The spec-driven format (requirements → design → tasks → steering) was
  followed throughout. The agent in session 2 read and respected the steering
  docs (`product.md`, `tech.md`, `structure.md`) without being re-briefed.
- The hooks in `.kiro/hooks/hooks.json` guard the pre-commit gate (typecheck)
  and remind about the no-secrets rule.
- The tasks checklist in `tasks.md` let the agent pick up exactly where the
  human-directed session stopped, with no ambiguity about what was done vs
  what remained.
- The agent found and fixed a real bug (`getMealById` treating TheMealDB's
  `"Invalid ID"` string as a valid meals array) that was not caught during the
  original hand-built session. This is exactly the kind of work the agent was
  set up to do: read the spec, run the verification, notice the discrepancy,
  trace the root cause, fix it in both affected files.

## What Kiro did not do

- Did not write the original MVP (session 1 was hand-built; sign-in was
  unavailable).
- Did not write the original spec, design, or task list (also session 1).
- Did not add any paid APIs, API keys, secrets, accounts, or new runtime
  dependencies.
- Did not modify `requirements.md` or `design.md`.
- Did not re-record the demo video. The CSS fix is cosmetic (hides an
  empty box that was already non-functional before first use); the app
  behaviour shown in the video is unchanged.

### Session end — monthly request-count limit reached

The session ended right after the commit (fa129ae): the next model turn
failed with HTTP 400 `ServiceQuotaExceededException`, reason
`MONTHLY_REQUEST_COUNT` ("You've reached your monthly usage limit. Please
return next month to continue building."). A resume attempt failed
immediately with the same error. The push to origin and the gh-pages
redeploy were therefore completed outside the Kiro session by the
supervising agent. No credit figure was shown by the CLI; mid-session it
also hit one HTTP 429 `CREDIT_CONSUMPTION_RATE_EXCEEDED` (recovered after
a 5-minute backoff) before the monthly cap stopped it.
