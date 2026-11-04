import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { forGrams } from "@/domain/nutrition";
import { db } from "@/lib/db";
import { foodParseEvents, type ParseFinalItem } from "@/lib/db/schema";
import { jsonCall, LlmError } from "../llm/openrouter";
import { webLookupFood } from "./web-lookup";
import { getFood, searchFoods, usualPortions, per100, type FoodSummary } from "./foods";
import { listStack } from "../supplements";
import { chooseGrams, cleanItem, isParseResult, matchSupplement, parseOutcome, parsePrompt, PARSE_SCHEMA, type ParseResult, type PortionChoice } from "./text-parse";

export interface DraftItem {
  /** What the person wrote for this item. */
  said: string;
  /** The query run against the food database. */
  search: string;
  quantity: number;
  unit: string;
  /** The model's own estimate, kept so corrections teach usual portions. */
  estGrams: number;
  grams: number;
  basis: PortionChoice["basis"];
  confidence: number;
  match: (FoodSummary & { portions: Array<{ label: string; grams: number }> }) | null;
  /** Other candidates for the confirm sheet's "not this" picker. */
  alternatives: FoodSummary[];
  /** Nutrients for `grams` of the match. */
  kcal: number;
  protein: number;
  /** "HH:mm" when the text said when; null = the sheet's time. */
  time: string | null;
  /** One of the athlete's supplements: logged as a dose, not a food. */
  supplement: { id: string; name: string; servingDesc: string } | null;
}

export interface TextDraft {
  /** The food_parse_events row; send it back with the log so the outcome is recorded. */
  draftId: string | null;
  items: DraftItem[];
  model: string;
  costUsd: number | null;
  latencyMs: number;
}

/**
 * "2 rotis, dal, 150g chicken tikka, coffee with milk" → draft items for the
 * confirm sheet. Nothing is saved here.
 */
export async function draftFromText(userId: string, text: string, client: "web" | "ios" | null = null): Promise<TextDraft> {
  const [usual, stack] = await Promise.all([usualPortions(userId), listStack(userId)]);
  const started = Date.now();
  let result;
  try {
    result = await jsonCall<ParseResult>({
      messages: parsePrompt(
        text,
        usual.map((u) => ({ name: u.name, grams: u.grams, times: u.times })),
        stack.map((s) => ({ name: s.name, hint: [...s.tags, s.brand].filter(Boolean).join(", ") || undefined }))
      ),
      schema: PARSE_SCHEMA,
      validate: isParseResult,
    });
  } catch (err) {
    if (err instanceof LlmError) {
      await recordDraft(userId, text, client, { error: err.message.slice(0, 500), latencyMs: Date.now() - started });
    }
    throw err;
  }
  const parsed = result.data.items.map(cleanItem).filter((i): i is NonNullable<typeof i> => !!i).slice(0, 20);
  const usualById = new Map(usual.map((u) => [u.foodId, u.grams]));
  // Web lookups cost money and seconds: at most a few per describe, and only where nothing matched.
  let webBudget = 3;

  const items = await Promise.all(
    parsed.map(async (p): Promise<DraftItem> => {
      const supp = p.supplement ? matchSupplement(p.supplement, stack) : null;
      if (supp) {
        return {
          said: p.name, search: p.search, quantity: p.quantity, unit: p.unit, estGrams: p.grams, grams: p.grams, basis: "estimate",
          confidence: p.confidence, match: null, alternatives: [], kcal: 0, protein: 0, time: p.time,
          supplement: { id: supp.id, name: supp.name, servingDesc: supp.servingDesc },
        };
      }
      const candidates = await searchFoods(userId, p.search, 6, { preferCooked: true });
      // A wrong food is worse than none: only a candidate with the food word is picked.
      // Weak ones stay as alternatives, so the sheet can offer them.
      let top: FoodSummary | undefined = candidates[0]?.strong === false ? undefined : candidates[0];
      if (!top && webBudget > 0) {
        webBudget--;
        top = (await webLookupFood(userId, p.search)).food ?? undefined;
      }
      if (!top) {
        return { said: p.name, search: p.search, quantity: p.quantity, unit: p.unit, estGrams: p.grams, grams: p.grams, basis: "estimate", confidence: p.confidence, match: null, alternatives: candidates.slice(0, 5), kcal: 0, protein: 0, time: p.time, supplement: null };
      }
      const { portions, food } = await getFood(userId, top.id);
      const choice = chooseGrams(p, portions, usualById.get(top.id) ?? null);
      const m = forGrams(per100(food), choice.grams);
      return {
        said: p.name,
        search: p.search,
        quantity: p.quantity,
        unit: p.unit,
        estGrams: p.grams,
        grams: choice.grams,
        basis: choice.basis,
        confidence: p.confidence,
        match: { ...top, portions },
        alternatives: candidates.slice(1),
        kcal: m.kcal,
        protein: m.protein,
        time: p.time,
        supplement: null,
      };
    })
  );
  const draftId = await recordDraft(userId, text, client, { items, model: result.model, costUsd: result.costUsd, latencyMs: result.latencyMs });
  return { draftId, items, model: result.model, costUsd: result.costUsd, latencyMs: result.latencyMs };
}

// --- Quality tracking -----------------------------------------------------------------
// Every attempt is kept, logged or not; recordOutcome fills in what was saved.
// Tracking never breaks logging: failures here are only reported.

async function recordDraft(
  userId: string,
  text: string,
  client: "web" | "ios" | null,
  r: { items?: DraftItem[]; model?: string; costUsd?: number | null; latencyMs?: number; error?: string }
): Promise<string | null> {
  const items = r.items ?? [];
  try {
    const [row] = await db
      .insert(foodParseEvents)
      .values({
        userId,
        text: text.slice(0, 1000),
        client,
        model: r.model ?? null,
        latencyMs: r.latencyMs ?? null,
        costUsd: r.costUsd ?? null,
        error: r.error ?? null,
        unmatched: items.filter((i) => !i.match && !i.supplement).length,
        draft: items.map((i) => ({
          said: i.said,
          search: i.search,
          quantity: i.quantity,
          unit: i.unit,
          estGrams: i.estGrams,
          grams: i.grams,
          basis: i.basis,
          confidence: i.confidence,
          matchId: i.match?.id ?? null,
          matchName: i.match?.name ?? null,
          matchSource: i.match?.source ?? null,
          alternativeIds: i.alternatives.map((a) => a.id),
          time: i.time,
          supplementId: i.supplement?.id ?? null,
        })),
      })
      .returning({ id: foodParseEvents.id });
    return row.id;
  } catch (err) {
    console.error("food_parse_events insert failed", err);
    return null;
  }
}

/**
 * The drafts became a log: store what was saved and how it differs. Several
 * describes in one sheet make one log, so the outcome is computed on their
 * combined draft and stored on the first; the rest are linked with zeros, so
 * weekly sums stay right. A draft only counts once.
 */
export async function recordOutcome(userId: string, draftIds: string[], logId: string | null, final: ParseFinalItem[]): Promise<void> {
  try {
    const events = await db
      .select({ id: foodParseEvents.id, draft: foodParseEvents.draft })
      .from(foodParseEvents)
      .where(and(inArray(foodParseEvents.id, draftIds), eq(foodParseEvents.userId, userId), isNull(foodParseEvents.loggedAt)))
      .orderBy(asc(foodParseEvents.createdAt));
    if (!events.length) return;
    const o = parseOutcome(events.flatMap((e) => e.draft), final);
    const zero = { kept: 0, regrammed: 0, swapped: 0, removed: 0, added: 0 };
    const loggedAt = new Date();
    for (const [i, e] of events.entries()) {
      await db
        .update(foodParseEvents)
        .set({ foodLogId: logId, loggedAt, final, ...(i === 0 ? o : zero) })
        .where(eq(foodParseEvents.id, e.id));
    }
  } catch (err) {
    console.error("food_parse_events outcome failed", err);
  }
}
