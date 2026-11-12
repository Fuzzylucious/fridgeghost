// FridgeGhost backend — built-in Node http only, no runtime dependencies.
// Serves static files from public/ and a JSON API under /api/.
// Every error is answered as JSON { error: string }; the server never
// crashes on a bad request or an upstream API failure.

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { daysLeft, isValidExpiryDate, sortByExpiry, urgencyFor } from "./expiry";
import {
  loadItems,
  loadShoppingList,
  newId,
  saveItems,
  saveShoppingList,
  type FridgeItem,
  type ShoppingEntry,
} from "./store";
import { lookupBarcode } from "./off/openfoodfacts";
import {
  getMealById,
  searchMealsByIngredient,
  type MealDetail,
} from "./off/themealdb";

const VERSION = "0.1.0";
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

// __dirname is dist/ when compiled; public/ and data/ sit at the repo root.
const publicDir = path.join(__dirname, "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeName(a: string): string {
  return a.trim().toLowerCase();
}

/**
 * Case-insensitive substring match in either direction: the fridge holds
 * "chicken breast" and the recipe wants "Chicken" (or vice versa).
 */
function ingredientInFridge(ingredientName: string, items: FridgeItem[]): boolean {
  const want = normalizeName(ingredientName);
  if (!want) return false;
  return items.some((item) => {
    const have = normalizeName(item.name);
    return have !== "" && (have.includes(want) || want.includes(have));
  });
}

function handleStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): void {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const decoded = decodeURIComponent(rel);
  const filePath = path.normalize(path.join(publicDir, decoded));
  if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
    sendError(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendError(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  });
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  url: URL,
): Promise<void> {
  const method = req.method ?? "GET";

  // ---- Health -------------------------------------------------------------
  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, version: VERSION });
    return;
  }

  // ---- Fridge items -------------------------------------------------------
  if (method === "GET" && pathname === "/api/items") {
    sendJson(res, 200, sortByExpiry(loadItems()));
    return;
  }

  if (method === "POST" && pathname === "/api/items") {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendError(res, 400, "Request body must be a JSON object");
      return;
    }
    const name = asOptionalString(body.name);
    const expiryDate = body.expiryDate;
    if (!name) {
      sendError(res, 400, "Missing required field: name");
      return;
    }
    if (typeof expiryDate !== "string" || !isValidExpiryDate(expiryDate)) {
      sendError(
        res,
        400,
        "Missing or invalid expiryDate (expected YYYY-MM-DD)",
      );
      return;
    }
    const item: FridgeItem = {
      id: newId(),
      name,
      brand: asOptionalString(body.brand),
      category: asOptionalString(body.category),
      quantity: asOptionalNumber(body.quantity) ?? 1,
      unit: asOptionalString(body.unit),
      expiryDate,
      barcode: asOptionalString(body.barcode),
      image: asOptionalString(body.image),
      addedAt: new Date().toISOString(),
    };
    const items = loadItems();
    items.push(item);
    saveItems(items);
    sendJson(res, 201, item);
    return;
  }

  const itemDelete = /^\/api\/items\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && itemDelete) {
    const id = decodeURIComponent(itemDelete[1]);
    const items = loadItems();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) {
      sendError(res, 404, "Item not found");
      return;
    }
    items.splice(idx, 1);
    saveItems(items);
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- Barcode lookup (Open Food Facts) -----------------------------------
  if (method === "GET" && pathname === "/api/lookup") {
    const barcode = url.searchParams.get("barcode");
    if (!barcode || !/^\d+$/.test(barcode)) {
      sendError(res, 400, "Missing or invalid barcode (digits only)");
      return;
    }
    try {
      const result = await lookupBarcode(barcode);
      sendJson(res, 200, result);
    } catch (err) {
      sendError(
        res,
        502,
        err instanceof Error ? err.message : "Open Food Facts unreachable",
      );
    }
    return;
  }

  // ---- Hauntings (expiring soon) ------------------------------------------
  if (method === "GET" && pathname === "/api/hauntings") {
    const rawDays = url.searchParams.get("days");
    const days = rawDays === null ? 3 : Number(rawDays);
    if (!Number.isInteger(days) || days < 0) {
      sendError(res, 400, "Invalid days parameter (expected a non-negative integer)");
      return;
    }
    const now = new Date();
    const hauntings = sortByExpiry(loadItems())
      .map((item) => {
        const left = daysLeft(item.expiryDate, now);
        return { item, daysLeft: left, urgency: urgencyFor(left) };
      })
      .filter((h) => h.daysLeft <= days)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    sendJson(res, 200, hauntings);
    return;
  }

  // ---- Recipes (TheMealDB) ------------------------------------------------
  if (method === "GET" && pathname === "/api/recipes") {
    const raw = url.searchParams.get("ingredients") ?? "";
    const ingredients = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (ingredients.length === 0) {
      sendError(res, 400, "Missing ingredients query parameter");
      return;
    }
    const first = ingredients[0];
    let summaries;
    try {
      summaries = await searchMealsByIngredient(first);
    } catch (err) {
      sendError(
        res,
        502,
        err instanceof Error ? err.message : "TheMealDB unreachable",
      );
      return;
    }
    if (summaries.length === 0) {
      sendJson(res, 200, {
        meals: [],
        note: `No meals found for "${first}". Try a different ingredient.`,
      });
      return;
    }
    const meals: MealDetail[] = [];
    try {
      for (const summary of summaries.slice(0, 3)) {
        const detail = await getMealById(summary.id);
        if (detail) meals.push(detail);
      }
    } catch (err) {
      sendError(
        res,
        502,
        err instanceof Error ? err.message : "TheMealDB unreachable",
      );
      return;
    }
    sendJson(res, 200, { meals });
    return;
  }

  // ---- Recipe detail by id ------------------------------------------------
  const recipeDetail = /^\/api\/recipes\/([^/]+)$/.exec(pathname);
  if (method === "GET" && recipeDetail) {
    const mealId = decodeURIComponent(recipeDetail[1]);
    let meal: MealDetail | null;
    try {
      meal = await getMealById(mealId);
    } catch (err) {
      sendError(
        res,
        502,
        err instanceof Error ? err.message : "TheMealDB unreachable",
      );
      return;
    }
    if (!meal) {
      sendError(res, 404, "Meal not found");
      return;
    }
    sendJson(res, 200, meal);
    return;
  }

  // ---- Shopping list ------------------------------------------------------
  if (method === "GET" && pathname === "/api/shopping-list") {
    sendJson(res, 200, loadShoppingList());
    return;
  }

  if (method === "POST" && pathname === "/api/shopping-list") {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendError(res, 400, "Request body must be a JSON object");
      return;
    }
    const name = asOptionalString(body.name);
    if (!name) {
      sendError(res, 400, "Missing required field: name");
      return;
    }
    const entry: ShoppingEntry = {
      id: newId(),
      name,
      quantity: asOptionalNumber(body.quantity),
      unit: asOptionalString(body.unit),
      reason: asOptionalString(body.reason),
      addedAt: new Date().toISOString(),
      checked: false,
    };
    const list = loadShoppingList();
    list.push(entry);
    saveShoppingList(list);
    sendJson(res, 201, entry);
    return;
  }

  const shopPatch = /^\/api\/shopping-list\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && shopPatch) {
    const id = decodeURIComponent(shopPatch[1]);
    const body = await readJsonBody(req);
    if (!isRecord(body) || typeof body.checked !== "boolean") {
      sendError(res, 400, "Request body must be { checked: boolean }");
      return;
    }
    const list = loadShoppingList();
    const entry = list.find((e) => e.id === id);
    if (!entry) {
      sendError(res, 404, "Shopping list entry not found");
      return;
    }
    entry.checked = body.checked;
    saveShoppingList(list);
    sendJson(res, 200, entry);
    return;
  }

  const shopDelete = /^\/api\/shopping-list\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && shopDelete) {
    const id = decodeURIComponent(shopDelete[1]);
    const list = loadShoppingList();
    const idx = list.findIndex((e) => e.id === id);
    if (idx === -1) {
      sendError(res, 404, "Shopping list entry not found");
      return;
    }
    list.splice(idx, 1);
    saveShoppingList(list);
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- Add missing recipe ingredients to the shopping list ----------------
  const addMissing = /^\/api\/recipes\/([^/]+)\/add-missing$/.exec(pathname);
  if (method === "POST" && addMissing) {
    const mealId = decodeURIComponent(addMissing[1]);
    let meal: MealDetail | null;
    try {
      meal = await getMealById(mealId);
    } catch (err) {
      sendError(
        res,
        502,
        err instanceof Error ? err.message : "TheMealDB unreachable",
      );
      return;
    }
    if (!meal) {
      sendError(res, 404, "Meal not found");
      return;
    }
    const items = loadItems();
    const list = loadShoppingList();
    const added: ShoppingEntry[] = [];
    const alreadyHave: string[] = [];
    for (const ing of meal.ingredients) {
      if (ingredientInFridge(ing.name, items)) {
        alreadyHave.push(ing.name);
        continue;
      }
      // Don't duplicate an entry already sitting unchecked on the list.
      const existing = list.find(
        (e) => !e.checked && normalizeName(e.name) === normalizeName(ing.name),
      );
      if (existing) {
        alreadyHave.push(ing.name);
        continue;
      }
      // TheMealDB's measure already contains the amount ("1 1/4 cup",
      // "3 Cups", "2") — store it whole as the unit with NO separate
      // quantity, or the list renders the amount twice (bug 3).
      const entry: ShoppingEntry = {
        id: newId(),
        name: ing.name,
        unit: ing.measure || undefined,
        reason: `for ${meal.name}`,
        addedAt: new Date().toISOString(),
        checked: false,
      };
      list.push(entry);
      added.push(entry);
    }
    saveShoppingList(list);
    sendJson(res, 200, { added, alreadyHave });
    return;
  }

  // ---- Unknown API route --------------------------------------------------
  if (pathname.startsWith("/api/")) {
    sendError(res, 404, "Unknown API route");
    return;
  }

  handleStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  (async () => {
    try {
      const host = req.headers.host ?? `localhost:${PORT}`;
      const url = new URL(req.url ?? "/", `http://${host}`);
      await handleApi(req, res, url.pathname, url);
    } catch (err) {
      console.error("[server] unhandled error:", err);
      if (!res.headersSent) {
        if (err instanceof Error && err.message === "Invalid JSON body") {
          sendError(res, 400, err.message);
        } else if (err instanceof Error && err.message === "Request body too large") {
          sendError(res, 413, err.message);
        } else {
          sendError(res, 500, "Internal server error");
        }
      } else {
        res.end();
      }
    }
  })();
});

server.on("clientError", (err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, () => {
  console.log(`FridgeGhost ${VERSION} listening on http://localhost:${PORT}`);
});
