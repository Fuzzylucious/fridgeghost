// Shared types for FridgeGhost.
// These interfaces are imported by src/store.ts, src/off/themealdb.ts,
// and src/server.ts. Keeping them in one place prevents the types from
// diverging across modules.

/** A single item stored in the fridge JSON file. */
export interface FridgeItem {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  quantity: number;
  unit?: string;
  expiryDate: string; // YYYY-MM-DD
  barcode?: string;
  image?: string;
  addedAt: string; // ISO timestamp
}

/**
 * FridgeItem with computed expiry fields added on read.
 * urgency values: "expired" | "critical" | "stirring" | "resting"
 * (matches the as-built expiry.ts urgency bands used throughout the codebase)
 */
export interface FridgeItemView extends FridgeItem {
  daysLeft: number;    // negative when expired
  urgency: string;     // see urgencyFor() in expiry.ts
}

/** A single entry in the shopping-list JSON file. */
export interface ShoppingEntry {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  reason?: string;
  addedAt: string; // ISO timestamp
  checked: boolean;
}

/** Minimal meal record returned by TheMealDB filter.php. */
export interface MealSummary {
  id: string;
  name: string;
  thumb: string;
}

/** One ingredient line in a MealDetail. */
export interface MealIngredient {
  name: string;
  measure: string;
}

/** Full meal record returned by TheMealDB lookup.php. */
export interface MealDetail extends MealSummary {
  category: string;
  area: string;
  instructions: string;
  ingredients: MealIngredient[];
}
