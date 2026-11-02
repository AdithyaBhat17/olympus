"use server";

import { revalidatePath } from "next/cache";
import { requireUserEmail } from "@/lib/auth";
import { DomainError } from "@/server/errors";
import { LlmError, openRouterConfigured } from "@/server/llm/openrouter";
import {
  archiveFood,
  createUserFood,
  deleteSavedMeal,
  favouriteFoods,
  listSavedMeals,
  saveMeal,
  foodByBarcode,
  getFood,
  recentFoods,
  saveRecipe,
  searchFoods,
  setFavourite,
  type RecipeInput,
  type UserFoodInput,
} from "@/server/food/foods";
import { createLog, deleteItem, deleteLog, updateItemGrams, type NewLog } from "@/server/food/logs";
import { draftFromText } from "@/server/food/log-text";
import { nudgesFor } from "@/server/supplements";
import { nudgeSummary } from "@/domain/supplements";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: (userId: string) => Promise<T>, revalidate = true): Promise<R<T>> {
  try {
    const data = await fn(await requireUserEmail());
    if (revalidate) revalidatePath("/food", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    if (err instanceof LlmError) {
      console.error(err);
      return { ok: false, error: "Couldn't read that. Try again, or search for the food." };
    }
    console.error(err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const str = (v: unknown, max = 200) => String(v ?? "").slice(0, max);

export async function draftTextAction(text: string) {
  return run(async (userId) => {
    if (!openRouterConfigured()) throw new DomainError("Text logging isn't set up on the server (OpenRouter key missing).");
    const t = str(text, 1000).trim();
    if (t.length < 2) throw new DomainError("Describe what you ate.");
    return draftFromText(userId, t);
  }, false);
}

export async function searchFoodsAction(query: string) {
  return run((userId) => searchFoods(userId, str(query, 100)), false);
}

export async function quickFoodsAction() {
  return run(async (userId) => {
    const [recent, favourites, meals] = await Promise.all([recentFoods(userId, 15), favouriteFoods(userId), listSavedMeals(userId)]);
    return { recent, favourites, meals };
  }, false);
}

export async function foodDetailAction(id: string) {
  return run(async (userId) => {
    const { food, portions } = await getFood(userId, str(id, 40));
    return { id: food.id, portions };
  }, false);
}

export async function barcodeAction(code: string) {
  return run(async (userId) => {
    const food = await foodByBarcode(str(code, 20));
    if (!food) throw new DomainError("Not found on Open Food Facts. Add it from the label instead.");
    const hits = await searchFoods(userId, food.name, 10);
    return hits.find((h) => h.id === food.id) ?? {
      id: food.id,
      name: food.name,
      brand: food.brand,
      source: food.source,
      kcal100g: food.kcal100g,
      protein100g: food.protein100g,
      carbs100g: food.carbs100g,
      fat100g: food.fat100g,
      fibre100g: food.fibre100g,
      servingG: food.servingG,
      servingLabel: food.servingLabel,
      verified: food.verified,
      favourite: false,
      timesLogged: 0,
    };
  }, false);
}

export async function logItemsAction(input: NewLog) {
  return run(async (userId) => {
    const log = await createLog(userId, {
      meal: input.meal,
      date: input.date,
      time: input.time,
      inputMode: input.inputMode,
      rawText: input.rawText,
      model: input.model,
      costUsd: input.costUsd,
      items: (input.items ?? []).slice(0, 40).map((i) => ({
        foodId: str(i.foodId, 40),
        grams: Number(i.grams),
        estGrams: i.estGrams == null ? null : Number(i.estGrams),
        confidence: i.confidence == null ? null : Number(i.confidence),
      })),
    });
    // Medication timing: a gentle note if this meal sits close to something it shouldn't.
    const nudges = await nudgesFor(userId, [`f:${log.id}`], log.eatenAt).catch(() => []);
    const summary = nudgeSummary(nudges);
    return { ...log, nudges: summary ? [summary] : [] };
  });
}

export async function deleteLogAction(id: string) {
  return run((userId) => deleteLog(userId, str(id, 40)));
}

export async function updateItemGramsAction(id: string, grams: number) {
  return run((userId) => updateItemGrams(userId, str(id, 40), Number(grams)));
}

export async function deleteItemAction(id: string) {
  return run((userId) => deleteItem(userId, str(id, 40)));
}

export async function toggleFavouriteAction(id: string, on: boolean) {
  return run((userId) => setFavourite(userId, str(id, 40), !!on), false);
}

export async function saveRecipeAction(input: RecipeInput) {
  return run((userId) =>
    saveRecipe(userId, {
      id: input.id ? str(input.id, 40) : undefined,
      name: str(input.name),
      ingredients: (input.ingredients ?? []).map((i) => ({ foodId: str(i.foodId, 40), grams: Number(i.grams) })),
      yieldG: input.yieldG ? Number(input.yieldG) : null,
      servingLabel: input.servingLabel ? str(input.servingLabel, 80) : null,
      servingG: input.servingG ? Number(input.servingG) : null,
      aliases: (input.aliases ?? []).map((a) => str(a, 60)),
    })
  );
}

export async function createUserFoodAction(input: UserFoodInput) {
  return run((userId) =>
    createUserFood(userId, {
      name: str(input.name),
      brand: input.brand ? str(input.brand, 80) : null,
      kcal: Number(input.kcal),
      protein: Number(input.protein),
      carbs: Number(input.carbs),
      fat: Number(input.fat),
      fibre: Number(input.fibre ?? 0),
      perServing: !!input.perServing,
      servingG: input.servingG ? Number(input.servingG) : null,
      servingLabel: input.servingLabel ? str(input.servingLabel, 80) : null,
      aliases: (input.aliases ?? []).map((a) => str(a, 60)),
    })
  );
}

export async function archiveFoodAction(id: string) {
  return run((userId) => archiveFood(userId, str(id, 40)));
}

export async function saveMealAction(name: string, items: Array<{ foodId: string; grams: number }>) {
  return run(
    (userId) =>
      saveMeal(
        userId,
        str(name, 80),
        (items ?? []).slice(0, 30).map((i) => ({ foodId: str(i.foodId, 40), grams: Number(i.grams) }))
      ),
    false
  );
}

export async function deleteSavedMealAction(id: string) {
  return run((userId) => deleteSavedMeal(userId, str(id, 40)), false);
}
