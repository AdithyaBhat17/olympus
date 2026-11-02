/**
 * Seed the athlete's confirmed stack (Phase 0 checkpoint, 2026-11-03).
 *
 *   pnpm supplements:seed --user you@gmail.com
 *
 * Idempotent: skips any supplement already in the stack by name.
 * Whey's kcal/carbs/fat are the usual ON Gold Standard label values and are
 * stored unverified until checked against the tub; protein (24 g/scoop) is
 * confirmed. Collagen gets no food link until its label values are known.
 */
import { arg, dbHost } from "../lib/env";

async function main() {
  const user = arg("user");
  if (!user) throw new Error("--user is required");
  console.error(`DB host: ${dbHost()}`);
  const { db } = await import("../../src/lib/db");
  const { foods, foodPortions, supplements, supplementIngredients } = await import("../../src/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { searchText } = await import("../../src/domain/nutrition");
  const { addSupplement } = await import("../../src/server/supplements");

  // Whey: per 100 g from 1 scoop = 31 g → 120 kcal, 24 g protein, 3 g carbs, 1.5 g fat.
  let [whey] = await db.select().from(foods).where(and(eq(foods.userId, user), eq(foods.name, "Gold Standard 100% Whey")));
  if (!whey) {
    const per = (v: number) => Math.round((v / 31) * 100 * 100) / 100;
    [whey] = await db
      .insert(foods)
      .values({
        userId: user,
        source: "user",
        name: "Gold Standard 100% Whey",
        brand: "Optimum Nutrition",
        aliases: ["whey", "whey protein", "protein shake"],
        searchText: searchText("Gold Standard 100% Whey", "Optimum Nutrition", ["whey", "whey protein", "protein shake"]),
        kcal100g: per(120),
        protein100g: per(24),
        carbs100g: per(3),
        fat100g: per(1.5),
        fibre100g: 0,
        tags: ["protein"],
        servingG: 31,
        servingLabel: "1 scoop",
        verified: false,
      })
      .returning();
    await db.insert(foodPortions).values({ foodId: whey.id, label: "1 scoop", grams: 31 });
    console.error("Added food: Gold Standard 100% Whey (protein confirmed; check kcal/carbs/fat on the tub)");
  }

  const stack = [
    { name: "Thyronorm", brand: "Abbott", form: "tablet", servingDesc: "1 tablet (150 mcg)", slot: "waking", tags: ["levothyroxine"], markers: ["TSH", "FT4", "FT3", "ANTI_TPO"], ing: [["levothyroxine", 150, "mcg"]], notes: "On waking, water only. Coffee/food 3–4 h later." },
    { name: "Creatine monohydrate", form: "powder", servingDesc: "5 g", slot: "any", tags: ["creatine"], ing: [["creatine monohydrate", 5, "g"]], notes: "Consistency matters, timing doesn't." },
    { name: "Whey protein", brand: "Optimum Nutrition", form: "powder", servingDesc: "1 scoop (31 g)", slot: "post_workout", tags: ["protein"], foodId: whey.id, foodGramsPerServing: 31, ing: [["protein", 24, "g"]] },
    { name: "Multi Collagen", brand: "Sports Research", form: "powder", servingDesc: "1 serving", slot: "any", tags: ["collagen", "protein"], notes: "Add its label values as a food to log its kcal; protein won't count toward 155 g." },
    { name: "Selenium", form: "tablet", servingDesc: "1 tablet (100 mcg)", slot: "lunch", tags: ["selenium"], markers: ["SELENIUM"], ing: [["selenium", 100, "mcg"]], notes: "With a meal." },
    { name: "Naturelo One Daily", brand: "Naturelo", form: "tablet", servingDesc: "1 tablet", slot: "lunch", tags: ["multivitamin"], notes: "With a meal, ≥4 h after Thyronorm. Check the label for iron, calcium and biotin, and tag them." },
    { name: "Magnesium glycinate", form: "tablet", servingDesc: "1 tablet", servingsPerDose: 2, slot: "bedtime", tags: ["magnesium"], markers: ["MG"], ing: [["magnesium glycinate", 100, "mg"]], notes: "2 tablets = 200 mg glycinate ≈ 28 mg elemental magnesium." },
    { name: "Vitamin D3", form: "softgel", servingDesc: "1 softgel (60,000 IU)", slot: "lunch", activeDays: [6], tags: ["vitamin_d"], markers: ["25OHD"], ing: [["vitamin D3", 60000, "IU"]], notes: "Saturdays, with a fat-containing meal. Retest due ~Dec 2026." },
  ] as const;

  const existing = await db.select({ name: supplements.name }).from(supplements).where(eq(supplements.userId, user));
  for (const s of stack) {
    if (existing.some((e) => e.name === s.name)) continue;
    const id = await addSupplement(user, {
      name: s.name,
      brand: "brand" in s ? s.brand : null,
      form: s.form,
      servingDesc: s.servingDesc,
      servingsPerDose: "servingsPerDose" in s ? s.servingsPerDose : 1,
      slot: s.slot,
      activeDays: "activeDays" in s ? [...s.activeDays] : [],
      tags: [...s.tags],
      markers: "markers" in s ? [...s.markers] : [],
      foodId: "foodId" in s ? s.foodId : null,
      foodGramsPerServing: "foodGramsPerServing" in s ? s.foodGramsPerServing : null,
      notes: "notes" in s ? s.notes : null,
    });
    if ("ing" in s) {
      await db.insert(supplementIngredients).values(s.ing.map(([nutrient, amount, unit]) => ({ supplementId: id, nutrient, amount, unit })));
    }
    console.error(`Added ${s.name}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
