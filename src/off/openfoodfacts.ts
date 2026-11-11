// Open Food Facts barcode lookup (free, no key).
// https://world.openfoodfacts.org/api/v0/product/<barcode>.json
//
// Open Food Facts requires a descriptive User-Agent; without one requests
// may be throttled or rejected. Network/upstream failures throw so the
// caller can answer 502; a barcode that simply isn't in the database
// resolves { found: false }.

export interface OffProduct {
  name: string;
  brand?: string;
  image?: string;
  categories?: string;
}

export interface BarcodeLookupResult {
  found: boolean;
  product?: OffProduct;
}

export const OFF_USER_AGENT = "FridgeGhost/0.1.0 (hackathon demo)";

interface OffApiResponse {
  status?: number; // 1 = found, 0 = not found
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    image_url?: string;
    image_front_url?: string;
    categories?: string;
  };
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(
    barcode,
  )}.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": OFF_USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new Error(
      `Open Food Facts unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Open Food Facts returned HTTP ${res.status}`);
  }
  let data: OffApiResponse;
  try {
    data = (await res.json()) as OffApiResponse;
  } catch {
    throw new Error("Open Food Facts returned invalid JSON");
  }
  if (data.status !== 1 || !data.product) {
    return { found: false };
  }
  const p = data.product;
  const name = (p.product_name || p.product_name_en || "").trim();
  if (!name) return { found: false };
  return {
    found: true,
    product: {
      name,
      brand: p.brands?.trim() || undefined,
      image: p.image_url || p.image_front_url || undefined,
      categories: p.categories?.trim() || undefined,
    },
  };
}
