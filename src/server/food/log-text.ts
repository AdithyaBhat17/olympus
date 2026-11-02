import "server-only";
import { forGrams } from "@/domain/nutrition";
import { jsonCall } from "../llm/openrouter";
import { getFood, searchFoods, usualPortions, per100, type FoodSummary } from "./foods";
import { chooseGrams, cleanItem, isParseResult, parsePrompt, PARSE_SCHEMA, type ParseResult, type PortionChoice } from "./text-parse";

export interface DraftItem {
  /** What the person wrote for this item. */
  said: string;
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
}

export interface TextDraft {
  items: DraftItem[];
  model: string;
  costUsd: number | null;
  latencyMs: number;
}

/**
 * "2 rotis, dal, 150g chicken tikka, coffee with milk" → draft items for the
 * confirm sheet. Nothing is saved here.
 */
export async function draftFromText(userId: string, text: string): Promise<TextDraft> {
  const usual = await usualPortions(userId);
  const result = await jsonCall<ParseResult>({
    messages: parsePrompt(text, usual.map((u) => ({ name: u.name, grams: u.grams, times: u.times }))),
    schema: PARSE_SCHEMA,
    validate: isParseResult,
  });
  const parsed = result.data.items.map(cleanItem).filter((i): i is NonNullable<typeof i> => !!i).slice(0, 20);
  const usualById = new Map(usual.map((u) => [u.foodId, u.grams]));

  const items = await Promise.all(
    parsed.map(async (p): Promise<DraftItem> => {
      const candidates = await searchFoods(userId, p.search, 6);
      const top = candidates[0];
      if (!top) {
        return { said: p.name, quantity: p.quantity, unit: p.unit, estGrams: p.grams, grams: p.grams, basis: "estimate", confidence: p.confidence, match: null, alternatives: [], kcal: 0, protein: 0 };
      }
      const { portions, food } = await getFood(userId, top.id);
      const choice = chooseGrams(p, portions, usualById.get(top.id) ?? null);
      const m = forGrams(per100(food), choice.grams);
      return {
        said: p.name,
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
      };
    })
  );
  return { items, model: result.model, costUsd: result.costUsd, latencyMs: result.latencyMs };
}
