import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { searchText } from "@/domain/nutrition";
import { db } from "@/lib/db";
import { foodPortions, foods } from "@/lib/db/schema";
import { jsonCall, openRouterConfigured } from "../llm/openrouter";
import { tagsFor } from "./sources";
import { offSearch, pickOffMatch } from "./off-search";
import { isWebFoodAnswer, toWebFood, webFoodPrompt, WEB_FOOD_SCHEMA, type WebFoodAnswer, type WebFoodValues } from "./web-food";
import { firecrawlConfigured, firecrawlFood } from "./firecrawl";
import { extractFromPage } from "./page-extract";
import { saveSharedFood, type FoodSummary } from "./foods";

/** FOOD_WEB_MODEL, else the text model: any OpenRouter model works with the web plugin. */
const webModel = () => process.env.FOOD_WEB_MODEL || undefined;

export interface WebLookup {
  /** The cached food, ready to log. null when nothing trustworthy was found. */
  food: (FoodSummary & { portions: Array<{ label: string; grams: number }> }) | null;
  /** True when it came from the cache (no model call). */
  cached: boolean;
  /** Why nothing was saved: not found, failed the sanity checks, model error. */
  reason?: string;
  costUsd?: number | null;
}

/** The cache key: the query as search sees it. "MuscleBlaze  Whey" and "muscleblaze whey" are one lookup. */
export const webKey = (query: string) => searchText(query).slice(0, 120);

/**
 * Look a food up on the web and save it, once: this athlete's cached lookups,
 * then Open Food Facts search (free, instant), then Firecrawl (search, the best
 * pages read by a small model), then, only if enabled, a model with web search.
 * A repeat of the same query is a database read. A lookup that finds nothing is not
 * cached (a retry may succeed), and any failure is "no match", never a throw:
 * logging must work without the web.
 */
export async function webLookupFood(userId: string, query: string): Promise<WebLookup> {
  const key = webKey(query);
  if (key.length < 3) return { food: null, cached: false, reason: "query too short" };

  const [hit] = await db
    .select()
    .from(foods)
    .where(and(eq(foods.userId, userId), eq(foods.source, "web"), eq(foods.sourceId, key), isNull(foods.archivedAt)))
    .limit(1);
  if (hit) return { food: await summarise(hit.id), cached: true };

  const started = Date.now();
  const done = (tier: string, outcome: string, extra: Record<string, unknown> = {}) =>
    console.info("[food-web]", JSON.stringify({ tier, outcome, query: key, ms: Date.now() - started, ...extra }));

  // Tier 1: Open Food Facts. Free and instant; saved for everyone, so the next search finds it in the database.
  const off = pickOffMatch(query, await offSearch(query));
  if (off) {
    const saved = await saveSharedFood(off);
    done("off", "found");
    return { food: await summarise(saved.id), cached: false };
  }

  // Tier 2: Firecrawl search, the best pages' text read by a small model: 3 to 5 credits and about 0.1 cent.
  if (firecrawlConfigured() && openRouterConfigured()) {
    const r = await firecrawlFood(query, extractFromPage);
    if (r.ok) {
      const id = await saveWebFood(userId, key, r.food);
      done("firecrawl", id ? "found" : "not saved", { credits: r.credits, usd: r.usd, url: r.url });
      if (id) return { food: await summarise(id), cached: false, costUsd: r.usd };
    } else done("firecrawl", r.reason, { credits: r.credits, usd: r.usd });
  }

  // Tier 3, opt-in: a model with its own web search (OpenRouter's plugin: 1.4 to 2.8 cents a lookup, and
  // source links that are Google redirects). Off unless FOOD_LOOKUP_OPENROUTER=1.
  if (process.env.FOOD_LOOKUP_OPENROUTER !== "1") return { food: null, cached: false, reason: "not found" };
  if (!openRouterConfigured()) return { food: null, cached: false, reason: "web lookup isn't set up" };
  let answer: WebFoodAnswer;
  let citations: string[];
  let costUsd: number | null;
  try {
    const r = await jsonCall<WebFoodAnswer>({
      messages: webFoodPrompt(query),
      schema: WEB_FOOD_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      validate: isWebFoodAnswer,
      models: webModel() ? [webModel()!] : undefined,
      timeoutMs: 25_000,
      web: true,
    });
    answer = r.data;
    citations = r.citations;
    costUsd = r.costUsd;
  } catch (err) {
    console.error("food web lookup failed", err);
    done("openrouter", "failed");
    return { food: null, cached: false, reason: "lookup failed" };
  }
  const checked = toWebFood(answer, citations);
  if (!checked.ok) {
    done("openrouter", checked.reason, { usd: costUsd });
    return { food: null, cached: false, reason: checked.reason, costUsd };
  }
  const id = await saveWebFood(userId, key, checked.food);
  done("openrouter", id ? "found" : "not saved", { usd: costUsd, url: checked.food.sourceUrl });
  if (!id) return { food: null, cached: false, reason: "couldn't save", costUsd };
  return { food: await summarise(id), cached: false, costUsd };
}

/** Save a web-sourced food as this athlete's own, once per query; returns its id. */
async function saveWebFood(userId: string, key: string, f: WebFoodValues): Promise<string | null> {
  const aliases = [...new Set([key, searchText(f.name, f.brand)])];
  const [row] = await db
    .insert(foods)
    .values({
      userId,
      source: "web",
      sourceId: key,
      sourceUrl: f.sourceUrl,
      name: f.name,
      brand: f.brand,
      aliases,
      searchText: searchText(f.name, f.brand, aliases),
      kcal100g: f.kcal100g,
      protein100g: f.protein100g,
      carbs100g: f.carbs100g,
      fat100g: f.fat100g,
      fibre100g: f.fibre100g,
      tags: tagsFor(f.name, { fibre: f.fibre100g }, {}),
      servingG: f.servingG,
      servingLabel: f.servingLabel,
      verified: false,
    })
    .onConflictDoNothing()
    .returning({ id: foods.id });
  // A concurrent identical lookup won the insert: use its row.
  const id = row?.id ?? (await db.select({ id: foods.id }).from(foods).where(and(eq(foods.userId, userId), eq(foods.source, "web"), eq(foods.sourceId, key))).limit(1))[0]?.id;
  if (!id) return null;
  if (row && f.servingG) await db.insert(foodPortions).values({ foodId: id, label: f.servingLabel ?? "1 serving", grams: f.servingG }).onConflictDoNothing();
  return id;
}

async function summarise(id: string): Promise<NonNullable<WebLookup["food"]>> {
  const [f] = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
  const portions = await db.select({ label: foodPortions.label, grams: foodPortions.grams }).from(foodPortions).where(eq(foodPortions.foodId, id));
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    source: f.source,
    kcal100g: f.kcal100g,
    protein100g: f.protein100g,
    carbs100g: f.carbs100g,
    fat100g: f.fat100g,
    fibre100g: f.fibre100g,
    servingG: f.servingG,
    servingLabel: f.servingLabel,
    verified: f.verified,
    sourceUrl: f.sourceUrl,
    favourite: false,
    timesLogged: 0,
    strong: true,
    portions,
  };
}
