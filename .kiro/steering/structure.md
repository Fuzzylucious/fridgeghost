# FridgeGhost — Structure Steering

## Repo layout

```
fridgeghost/
├── .kiro/
│   ├── specs/fridgeghost/      # Spec-driven development (this project)
│   │   ├── requirements.md     # EARS requirements + acceptance criteria
│   │   ├── design.md           # Architecture, API contract, error handling
│   │   └── tasks.md            # Sequenced implementation checklist
│   ├── steering/
│   │   ├── product.md          # Product vision + tone (this file's siblings)
│   │   ├── tech.md             # Stack, free-APIs-only, no-secrets rules
│   │   └── structure.md        # This file: layout + ownership + API shapes
│   └── hooks/
│       └── hooks.json          # Agent hooks (build check, no-secrets reminder)
├── docs/
│   └── KIRO_USAGE.md           # Honest write-up of how Kiro was (not) used
├── public/                     # Static frontend (vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── src/                        # TypeScript server (strict, built-in http)
│   ├── server.ts               # HTTP server, routing, static serving
│   ├── store.ts                # JSON-file fridge + shopping-list stores
│   ├── expiry.ts               # Pure expiry/urgency helpers (no I/O)
│   └── off/
│       ├── openfoodfacts.ts    # Open Food Facts barcode client
│       └── themealdb.ts        # TheMealDB recipe client
├── data/                       # Runtime JSON data (gitignored, created at runtime)
│   ├── fridge.json
│   └── shopping-list.json
├── package.json                # scripts: build (tsc), dev, start
├── tsconfig.json               # strict, outDir dist, rootDir src
├── .gitignore                  # node_modules, dist, data, .env — .kiro/ NOT ignored
├── LICENSE                     # MIT
└── README.md                   # Pitch, quickstart, API summary
```

## File ownership

- **Specs & docs workstream** owns `.kiro/**`, `README.md`, `docs/`.
  It does not touch `src/`, `public/`, `package.json`, `tsconfig.json`,
  `.gitignore`, or `LICENSE`.
- **Server workstream** owns `src/**`.
- **Frontend workstream** owns `public/**`.
- `.kiro/` is intentionally **not** gitignored: the Kiroween submission
  requires a `/.kiro` directory at the repo root.

## API shapes

Base: `http://localhost:3000` (`PORT` env var, default 3000). JSON everywhere.

- `GET /api/health` → 200 `{ "status": "ok" }`
- `GET /api/items` → 200 `FridgeItemView[]`
- `POST /api/items` `{ name, expiryDate, quantity?, unit?, category?, barcode? }` → 201 `FridgeItemView` / 400
- `DELETE /api/items/:id` → 204 / 404
- `GET /api/lookup?barcode=` → 200 `{ "name", "brand"? }` / 400 / 404 / 502
- `GET /api/hauntings` → 200 `FridgeItemView[]` (non-fresh, expiry ascending)
- `GET /api/recipes?ingredients=a,b` → 200 `MealSummary[]` / 400 / 502
- `POST /api/recipes/:id/add-missing` → 200 `{ "added": ShoppingEntry[] }` / 404 / 502
- `GET /api/shopping-list` → 200 `ShoppingEntry[]`
- `POST /api/shopping-list` `{ name, quantity? }` → 201 `ShoppingEntry` / 400
- `DELETE /api/shopping-list/:id` → 204 / 404

Core types (defined in `src/store.ts` and `src/off/themealdb.ts`):

```ts
interface FridgeItem {
  id: string;           // crypto.randomUUID()
  name: string;
  quantity: number;     // default 1
  unit: string;         // default "pcs"
  expiryDate: string;   // "YYYY-MM-DD"
  category?: string;
  barcode?: string;
  addedAt: string;      // ISO timestamp
}
interface FridgeItemView extends FridgeItem {
  daysLeft: number;     // negative when expired
  urgency: "fresh" | "soon" | "today" | "expired";
}
interface ShoppingEntry {
  id: string;
  name: string;
  quantity: number;     // default 1
  checked: boolean;     // default false
  addedAt: string;
}
interface MealSummary { id: string; name: string; thumbnail: string; }
interface MealDetail extends MealSummary {
  ingredients: { name: string; measure: string }[];
  instructions: string;
}
```

## Conventions

- `npm run build` must pass before commit (enforced by the hook in
  `.kiro/hooks/hooks.json`).
- `data/` is runtime state, never committed. `dist/` is build output, never
  committed. `.kiro/` is always committed.
- One endpoint, one handler branch in `src/server.ts`; keep the route table
  readable top-to-bottom in the same order as the API contract above.
