/**
 * Open Food Facts text search: the cheap first tier for a branded product the
 * database doesn't have. Free, ~10 ms, structured per-100 g values, and no
 * model tokens. The slower model-based web lookup only runs when this finds
 * nothing we'd trust.
 *
 * OFF is crowd-sourced, so a hit is only used when every word of the query is
 * in its brand or name, at least one is in its BRAND (this tier is for branded
 * products: a generic "chai" must not become some brand's instant sachet and be
 * saved for everyone), and its numbers pass the same sanity checks as a web
 * label (kcal present and consistent with the macros).
 */
import { atwaterGap, searchText } from "@/domain/nutrition";
import { offFood, type MappedFood } from "./sources";

type Obj = Record<string, unknown>;

const FIELDS = "code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity";

/** The top OFF products for a text query, most relevant first. [] on any failure: this tier is optional. */
export async function offSearch(query: string, fetchImpl: typeof fetch = fetch): Promise<Obj[]> {
  try {
    const res = await fetchImpl(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(query.slice(0, 100))}&page_size=8&fields=${FIELDS}`, {
      headers: { "User-Agent": "Olympus/1.0 (personal nutrition log; contact via github.com/AdithyaBhat17/olympus)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { hits?: unknown };
    return Array.isArray(body.hits) ? (body.hits.filter((h) => typeof h === "object" && h !== null) as Obj[]) : [];
  } catch {
    return [];
  }
}

/** Search returns brands as a list; the mapper (and the barcode API) use a comma string. */
const normalise = (h: Obj): Obj => ({ ...h, brands: Array.isArray(h.brands) ? h.brands.filter((b) => typeof b === "string").join(", ") : h.brands });

/**
 * The first hit that is plainly the product asked for, mapped to a food, or
 * null. "Plainly": all query words appear in brand + name, and the numbers are
 * believable (kcal > 0, near what 4/4/9 gives from the macros).
 */
export function pickOffMatch(query: string, hits: Obj[]): MappedFood | null {
  const words = searchText(query).split(" ").filter((w) => w.length >= 2);
  if (!words.length) return null;
  for (const raw of hits) {
    const hit = normalise(raw);
    const text = searchText([hit.brands, hit.product_name, hit.generic_name].filter((v) => typeof v === "string").join(" "));
    const have = new Set(text.split(" "));
    if (!words.every((w) => have.has(w))) continue;
    const brand = new Set(searchText(typeof hit.brands === "string" ? hit.brands : "").split(" "));
    if (!words.some((w) => brand.has(w))) continue;
    const mapped = offFood(hit);
    if (!mapped) continue;
    const f = mapped.food;
    if (!(f.kcal100g > 0) || f.protein100g == null || f.carbs100g == null || f.fat100g == null) continue;
    const gap = atwaterGap({ kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fibre: f.fibre100g ?? null });
    if (gap !== null && gap > 0.3 && Math.abs(gap * f.kcal100g) > 25) continue;
    return mapped;
  }
  return null;
}
