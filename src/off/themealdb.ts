// TheMealDB free API (no key).
// Base: https://www.themealdb.com/api/json/v1/1/
//   filter.php?i=<ingredient>  -> meals matching one ingredient (summaries)
//   lookup.php?i=<meal id>     -> full meal detail
//
// TheMealDB returns ingredients as strIngredient1..20 + strMeasure1..20.
// Network/upstream failures throw so the caller can answer 502; a query
// with no matches resolves to an empty list / null, not an error.

import type { MealSummary, MealIngredient, MealDetail } from "../types";

// Re-export so callers that imported these types from themealdb.ts keep working.
export type { MealSummary, MealIngredient, MealDetail } from "../types";

const BASE = "https://www.themealdb.com/api/json/v1/1";

interface FilterResponse {
  meals: Array<{
    idMeal?: string;
    strMeal?: string;
    strMealThumb?: string;
  }> | null;
}

type LookupMeal = Record<string, unknown>;

interface LookupResponse {
  meals: LookupMeal[] | null;
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    throw new Error(
      `TheMealDB unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`TheMealDB returned HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error("TheMealDB returned invalid JSON");
  }
}

/** Meal summaries containing `ingredient` (first-ingredient filter). */
export async function searchMealsByIngredient(
  ingredient: string,
): Promise<MealSummary[]> {
  const data = (await fetchJson(
    `${BASE}/filter.php?i=${encodeURIComponent(ingredient)}`,
  )) as FilterResponse;
  if (!data.meals) return [];
  return data.meals
    .filter((m) => m.idMeal && m.strMeal)
    .map((m) => ({
      id: m.idMeal as string,
      name: m.strMeal as string,
      thumb: m.strMealThumb ?? "",
    }));
}

/** Full detail for one meal id, or null when TheMealDB has no such meal. */
export async function getMealById(id: string): Promise<MealDetail | null> {
  const data = (await fetchJson(
    `${BASE}/lookup.php?i=${encodeURIComponent(id)}`,
  )) as LookupResponse;
  if (!Array.isArray(data.meals) || data.meals.length === 0) return null;
  return parseMealDetail(data.meals[0]);
}

/** Pull the strIngredientN / strMeasureN pairs out of a raw meal record. */
export function parseIngredients(meal: LookupMeal): MealIngredient[] {
  const out: MealIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const rawName = meal[`strIngredient${i}`];
    const rawMeasure = meal[`strMeasure${i}`];
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) continue;
    out.push({
      name,
      measure: typeof rawMeasure === "string" ? rawMeasure.trim() : "",
    });
  }
  return out;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseMealDetail(meal: LookupMeal): MealDetail {
  return {
    id: asString(meal.idMeal),
    name: asString(meal.strMeal),
    thumb: asString(meal.strMealThumb),
    category: asString(meal.strCategory),
    area: asString(meal.strArea),
    instructions: asString(meal.strInstructions),
    ingredients: parseIngredients(meal),
  };
}
