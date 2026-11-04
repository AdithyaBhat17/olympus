import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
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

const inflight = new Map<string, Promise<WebLookup>>();
/**
 * A miss is not saved (a retry later may succeed), but the same miss within
 * minutes (a double tap, a re-run describe) must not pay for the same search again.
 */
const recentMisses = new Map<string, number>();
const MISS_TTL_MS = 10 * 60_000;

/**
 * Look a food up on the web and save it, once: this athlete's cached lookups,
 * then Open Food Facts search (free, instant), then Firecrawl (search, the best
 * pages read by a small model), then, only if enabled, a model with web search.
 * A repeat of the same query is a database read. Any failure, including a
 * database error, is "no match", never a throw: logging must work without the
 * web, and a describe must not lose its other items to one failed lookup.
 * Concurrent identical lookups share one run.
 */
export async function webLookupFood(userId: string, query: string): Promise<WebLookup> {
  const key = webKey(query);
  if (key.length < 3) return { food: null, cached: false, reason: "query too short" };
  const id = `${userId}|${key}`;
  const running = inflight.get(id);
  if (running) return running;
  const p = lookup(userId, query, key, id)
    .then((r) => {
      if (!r.food && r.reason !== "lookup failed") {
        if (recentMisses.size > 500) recentMisses.clear();
        recentMisses.set(id, Date.now());
      }
      return r;
    })
    .catch((err): WebLookup => {
      console.error("food web lookup failed", err);
      return { food: null, cached: false, reason: "lookup failed" };
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

async function lookup(userId: string, query: string, key: string, missKey: string): Promise<WebLookup> {
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

  // The paid tiers below: not again for a query that just missed.
  const missedAt = recentMisses.get(missKey);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return { food: null, cached: false, reason: "not found" };

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

/**
 * Save a web-sourced food as this athlete's own, once per query; returns its id.
 * A fresh lookup replaces a cached or archived row of the same query (the unique
 * index has no archived_at, so an archived row would otherwise block the new
 * values and come back unchanged): the athlete asked again, so they get the
 * new numbers. Logged items keep their own snapshot, so nothing past changes.
 */
async function saveWebFood(userId: string, key: string, f: WebFoodValues): Promise<string | null> {
  const aliases = [...new Set([key, searchText(f.name, f.brand)])];
  const values = {
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
  };
  const [row] = await db
    .insert(foods)
    .values({ userId, source: "web", sourceId: key, ...values })
    .onConflictDoUpdate({
      target: [foods.userId, foods.sourceId],
      targetWhere: sql`source = 'web' AND source_id IS NOT NULL`,
      set: { ...values, archivedAt: null, updatedAt: sql`now()` },
    })
    .returning({ id: foods.id });
  if (!row) return null;
  await db.delete(foodPortions).where(eq(foodPortions.foodId, row.id));
  if (f.servingG) await db.insert(foodPortions).values({ foodId: row.id, label: f.servingLabel ?? "1 serving", grams: f.servingG }).onConflictDoNothing();
  return row.id;
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
