/**
 * Tier 2 of the food lookup: Firecrawl search, then the best pages' text read
 * by a small model. Unlike a model with its own web search (OpenRouter's
 * plugin: 1.4 to 2.8 cents a lookup), we choose the source (the brand's own
 * page before an aggregator), pay only for search (2 credits) and one 1-credit
 * page read per attempt, and the model sees a few thousand characters of the
 * page, about a tenth of a cent. The same sanity checks as every other tier
 * (toWebFood) decide whether to trust the result.
 *
 * Benchmark (six real products): 3 found, 3 to 7 s, 3 to 4 credits each; every
 * refusal was a page with no label, or the wrong product or form.
 */
import { searchText } from "@/domain/nutrition";
import { toWebFood, type WebFoodAnswer, type WebFoodValues } from "./web-food";

const API = "https://api.firecrawl.dev/v2";

export const firecrawlConfigured = () => !!process.env.FIRECRAWL_API_KEY;

export interface SearchHit {
  url: string;
  title?: string;
  description?: string;
}

/** Where nutrition numbers are most trustworthy, after the product's own site. */
const SOURCE_SCORE: Array<[RegExp, number]> = [
  [/(^|\.)openfoodfacts\.org$/, 2.5],
  [/(^|\.)fatsecret\./, 1.5],
  [/(^|\.)nutritionix\.com$/, 1.5],
  [/(^|\.)(eatthismuch|myfitnesspal|calorieking|cronometer)\./, 1],
];
/** Pages that never hold a label. */
const SKIP = /(^|\.)(youtube|reddit|facebook|instagram|pinterest|tiktok|x|twitter|quora)\.(com|co)$/;

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const words = (query: string, min: number) => searchText(query).split(" ").filter((w) => w.length >= min);

/**
 * Search hits, best source first. A host that contains a query word is the
 * product's own site ("starbucks.com", "epigamiastore.com") and leads; then
 * Open Food Facts and the nutrition databases; then pages whose title and
 * snippet cover the query. Ties keep the search engine's order.
 */
export function rankSources(query: string, hits: SearchHit[]): SearchHit[] {
  const brandish = words(query, 4);
  const all = words(query, 3);
  return hits
    .filter((h) => /^https:\/\//i.test(h.url) && !SKIP.test(host(h.url)))
    .map((h, i) => {
      const hh = host(h.url);
      let score = 0;
      if (brandish.some((w) => hh.includes(w))) score += 3;
      score += SOURCE_SCORE.find(([re]) => re.test(hh))?.[1] ?? 0;
      const text = searchText(`${h.title ?? ""} ${h.description ?? ""}`);
      if (all.length && all.every((w) => text.includes(w))) score += 1;
      // A snippet that already shows numbers is a page with a label; a shop page usually has none (and costs 5 credits to find out).
      // Titles are no evidence: every aggregator page says "Nutrition Facts" in its title.
      if (/\b\d{2,4}\s*(kcal|calories)\b|nutrition facts|nutrition information/i.test(h.description ?? "")) score += 2;
      // Calories alone (a menu page) is not a label: the macros are what we need.
      // "packed with protein" is marketing; "Protein 13 g" is a label: a number must follow.
      if (/(protein|carbohydrates?|total fat)\D{0,12}\d/i.test(h.description ?? "")) score += 1.5;
      return { h, i, score };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.h);
}

/**
 * "Masala chai" must not become the dry tea leaves, a hot latte the iced one,
 * nor a burger the burger-and-fries combo: a different form of the food, named
 * but not asked for, is a different product.
 */
/** A form named on the extracted product's own name that the query didn't ask for. */
const NAME_FORMS = /\b(patti|powder|premix|mix|leaves|granules|sachets?|concentrate|syrup|seasoning|capsules?|tablets?|iced|cold|frozen|frappuccino|decaf|decaffeinated|diet|zero|raw|dried|dry|fries|meal|combo|bucket|platter)\b/g;
/**
 * On the page address only the unambiguous ones: "/zero-sugar-protein-bar" or "/raw-honey" is a fine page for
 * "protein bar" or "honey", but "/zinger-burger-with-fries" is the combo even when the page calls its food "Zinger Burger".
 */
const URL_FORMS = /\b(patti|powder|premix|leaves|granules|sachets?|concentrate|syrup|seasoning|capsules?|tablets?|iced|frappuccino|decaf|decaffeinated|frozen|fries|combo|bucket|platter)\b/g;

export function otherForm(query: string, name: string | undefined, url: string | undefined): boolean {
  const asked = new Set(searchText(query).split(" "));
  const flagged = (re: RegExp, text: string | undefined) => (searchText((text ?? "").replace(/[-_/.]+/g, " ")).match(re) ?? []).some((w) => !asked.has(w));
  return flagged(NAME_FORMS, name) || flagged(URL_FORMS, url);
}

/**
 * A page can be right about itself and still not be what was asked for (a
 * category page, a different flavour). At least 60% of the query's words must
 * appear in what the page calls the food, its brand or its site address.
 */
export function queryOverlap(query: string, ...parts: Array<string | undefined>): boolean {
  const q = words(query, 3);
  if (!q.length) return false;
  const have = searchText(parts.filter(Boolean).join(" "));
  return q.filter((w) => have.includes(w)).length >= Math.ceil(q.length * 0.6);
}

type Fetch = typeof fetch;

/** Reads a page's label text with a model. Injected so this file stays pure and testable. */
export type Extract = (page: { query: string; url: string; text: string }) => Promise<{ answer: WebFoodAnswer; costUsd: number }>;

/**
 * The part of a page that holds the label: a few thousand characters from the
 * first place calories are followed by a number ("Calories 190", "190 kcal"),
 * else from a "Nutrition Facts" heading, else from any mention. A bare "high
 * energy" or "burn calories" in marketing copy or the menu is not the label.
 */
export function labelText(markdown: string): string {
  const anchors = [/\bcalories\s*[:\-]?\s*\d|\bkcal\s*[:\-]?\s*\d|\d\s*kcal\b|\benergy\s*[:\-]?\s*\d/i, /nutrition(al)? (facts|information|value)/i, /calories|kcal|energy/i];
  let i = -1;
  for (const re of anchors) {
    i = markdown.search(re);
    if (i >= 0) break;
  }
  const slice = i >= 0 ? markdown.slice(Math.max(0, i - 800), i + 3500) : markdown.slice(0, 3000);
  return slice.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * One POST, bounded by `deadline` (a timestamp). The free plan allows about 12
 * requests a minute and a describe can run several lookups at once, so a 429
 * waits out `retry_after_seconds` (at most 6 s, and only if that still leaves
 * time) and tries once more.
 */
async function post(path: string, body: unknown, fetchImpl: Fetch, deadline: number, retry = true): Promise<Record<string, unknown> | null> {
  const left = deadline - Date.now();
  if (left < 1000) return null;
  try {
    const res = await fetchImpl(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(left, 12_000)),
    });
    if (res.status === 429 && retry) {
      const asked = Number(((await res.json().catch(() => ({}))) as { retry_after_seconds?: number }).retry_after_seconds);
      const wait = Math.min(6, Number.isFinite(asked) ? asked : 5);
      if (deadline - Date.now() < wait * 1000 + 2000) return null;
      await new Promise((r) => setTimeout(r, wait * 1000));
      return post(path, body, fetchImpl, deadline, false);
    }
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return json.success === false ? null : json;
  } catch {
    return null;
  }
}

/** `p`, or a rejection after `ms`. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), Math.max(ms, 0)); })]).finally(() => clearTimeout(timer));
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

export type FirecrawlResult =
  | { ok: true; food: WebFoodValues; url: string; credits: number; usd: number }
  | { ok: false; reason: string; credits: number; usd: number };

const MAX_PAGES = 3;
/** The whole lookup, search to last page, ends by this: a miss must not hold up a describe (or the next tier) for long. */
const TOTAL_MS = 20_000;
/** Don't start another page with less than this left. */
const MIN_PAGE_MS = 4_000;

/** Search, then read up to three of the best-ranked pages; the first that passes every check wins. Never longer than ~20 s. */
export async function firecrawlFood(query: string, extract: Extract, fetchImpl: Fetch = fetch, totalMs = TOTAL_MS): Promise<FirecrawlResult> {
  const deadline = Date.now() + totalMs;
  const minPage = Math.min(MIN_PAGE_MS, totalMs / 3);
  let credits = 0;
  let usd = 0;
  const found = await post("/search", { query: `${query.slice(0, 120)} nutrition facts`, limit: 6 }, fetchImpl, deadline);
  if (!found) return { ok: false, reason: "search failed", credits, usd };
  credits += n(found.creditsUsed) || 2;
  const web = obj(found.data).web;
  const hits = (Array.isArray(web) ? web : []).map(obj).filter((h) => typeof h.url === "string").map((h) => ({ url: s(h.url), title: s(h.title), description: s(h.description) }));
  const ranked = rankSources(query, hits).slice(0, MAX_PAGES);
  if (!ranked.length) return { ok: false, reason: "no results", credits, usd };

  let reason = "no page had a usable label";
  for (const hit of ranked) {
    if (deadline - Date.now() < minPage) {
      reason = "ran out of time";
      break;
    }
    const page = await post("/scrape", { url: hit.url, formats: ["markdown"], onlyMainContent: true }, fetchImpl, deadline);
    if (!page) {
      reason = "page read failed";
      continue;
    }
    const data = obj(page.data);
    credits += n(obj(data.metadata).creditsUsed) || 1;
    const text = labelText(s(data.markdown));
    if (text.length < 40) {
      reason = "the page had no text";
      continue;
    }
    let answer: WebFoodAnswer;
    try {
      const r = await within(extract({ query, url: hit.url, text }), deadline - Date.now());
      answer = { ...r.answer, sourceUrl: hit.url };
      usd += r.costUsd;
    } catch {
      // The model's cost isn't known when its call throws, so `usd` can undercount on failures.
      reason = "extraction failed";
      continue;
    }
    if (!answer.found) {
      reason = "no label on the page";
      continue;
    }
    // The extracted product must be the one asked for. The search title is not evidence: it can describe a different item on the page.
    if (!queryOverlap(query, answer.name, answer.brand, host(hit.url))) {
      reason = "the page is a different product";
      continue;
    }
    if (otherForm(query, answer.name, hit.url)) {
      reason = "the page is a different form of the food";
      continue;
    }
    const checked = toWebFood(answer, [hit.url]);
    if (checked.ok) return { ok: true, food: checked.food, url: hit.url, credits, usd };
    reason = checked.reason;
  }
  return { ok: false, reason, credits, usd };
}
