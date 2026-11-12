// JSON-file persistence for fridge items and the shopping list.
// Files live in <repo-root>/data/ (gitignored) and are created at runtime.
// Writes are atomic-ish: write to a temp file in the same directory, then
// rename over the target, so a crash mid-write never leaves a torn file.

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { FridgeItem, ShoppingEntry } from "./types";

// Re-export so callers that imported these types from store.ts keep working.
export type { FridgeItem, ShoppingEntry } from "./types";

// __dirname is dist/ when compiled (src/ when run under ts-node); either way
// the data dir is one level up from the code dir, i.e. the repo root.
const dataDir = path.join(__dirname, "..", "data");
const fridgePath = path.join(dataDir, "fridge.json");
const shoppingPath = path.join(dataDir, "shopping.json");

export function newId(): string {
  return randomUUID();
}

function ensureDataDir(): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJsonFile<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    // Missing file (first run) or corrupt JSON: start empty rather than crash.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[store] could not read ${filePath}, starting empty:`, err);
    }
    return [];
  }
}

function writeJsonFile<T>(filePath: string, rows: T[]): void {
  ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(rows, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function loadItems(): FridgeItem[] {
  return readJsonFile<FridgeItem>(fridgePath);
}

export function saveItems(items: FridgeItem[]): void {
  writeJsonFile(fridgePath, items);
}

export function loadShoppingList(): ShoppingEntry[] {
  return readJsonFile<ShoppingEntry>(shoppingPath);
}

export function saveShoppingList(entries: ShoppingEntry[]): void {
  writeJsonFile(shoppingPath, entries);
}
