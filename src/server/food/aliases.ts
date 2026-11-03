/**
 * Indian names for USDA raw ingredients, and canonical single-word names
 * ("egg", "milk", "roti") for the plain version of a staple. Applied to USDA
 * and INDB rows, applied at import by matching the
 * USDA description. Nutrient values stay USDA's; this only makes "toor dal"
 * or "atta" find them. Every pattern is checked by the import report.
 */
export const USDA_ALIASES: Array<{ match: RegExp; aliases: string[] }> = [
  { match: /^Pigeon peas \(red gram\), mature seeds, raw$/, aliases: ["toor dal raw", "arhar dal raw", "tuvar dal raw"] },
  { match: /^Pigeon peas \(red gram\), mature seeds, cooked, boiled, without salt$/, aliases: ["toor dal cooked", "arhar dal cooked"] },
  { match: /^Mung beans, mature seeds, raw$/, aliases: ["moong dal raw", "green gram raw", "mung dal raw"] },
  { match: /^Mung beans, mature seeds, cooked, boiled, without salt$/, aliases: ["moong dal cooked", "green gram cooked"] },
  { match: /^Lentils, raw$/, aliases: ["masoor dal raw", "red lentils raw"] },
  { match: /^Lentils, mature seeds, cooked, boiled, without salt$/, aliases: ["masoor dal cooked", "dal cooked"] },
  { match: /^Chickpeas \(garbanzo beans, bengal gram\), mature seeds, raw$/, aliases: ["chana raw", "kabuli chana raw", "chole raw"] },
  { match: /^Chickpeas \(garbanzo beans, bengal gram\), mature seeds, cooked, boiled, without salt$/, aliases: ["chana cooked", "chole boiled"] },
  { match: /^Beans, kidney, all types, mature seeds, raw$/, aliases: ["rajma raw"] },
  { match: /^Beans, kidney, all types, mature seeds, cooked, boiled, without salt$/, aliases: ["rajma boiled"] },
  { match: /^Mungo beans, mature seeds, raw$/, aliases: ["urad dal raw", "black gram raw"] },
  { match: /^Wheat flour, whole-grain( \(Includes foods for USDA's Food Distribution Program\))?$/, aliases: ["atta", "whole wheat flour", "chakki atta"] },
  { match: /^Wheat flour, white, all-purpose, enriched, bleached$/, aliases: ["maida"] },
  { match: /^Semolina, enriched$/, aliases: ["sooji", "suji", "rava"] },
  { match: /^Chickpea flour \(besan\)$/, aliases: ["gram flour"] },
  { match: /^Rice, white, long-grain, regular, raw, enriched$/, aliases: ["basmati rice raw", "chawal raw"] },
  { match: /^Rice, white, long-grain, regular, enriched, cooked$/, aliases: ["rice", "white rice", "basmati rice cooked", "chawal cooked", "steamed rice"] },
  { match: /^Rice, brown, long-grain, cooked( \(Includes foods for USDA's Food Distribution Program\))?$/, aliases: ["brown rice cooked"] },
  { match: /^Yogurt, plain, whole milk$/, aliases: ["dahi", "curd"] },
  { match: /^Yogurt, plain, low fat$/, aliases: ["low fat dahi", "low fat curd"] },
  { match: /^Butter, Clarified butter \(ghee\)$/, aliases: ["desi ghee"] },
  { match: /^Milk, whole, 3\.25% milkfat, with added vitamin D$/, aliases: ["milk", "full cream milk", "doodh"] },
  { match: /^Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D$/, aliases: ["toned milk"] },
  { match: /^Oats, whole grain, rolled, old fashioned$/, aliases: ["rolled oats raw"] },
  { match: /^Egg, whole, raw, fresh$/, aliases: ["egg", "eggs", "anda", "whole egg"] },
  { match: /^Egg, whole, cooked, hard-boiled$/, aliases: ["boiled egg", "boiled eggs"] },
  { match: /^Egg, white, raw, fresh$/, aliases: ["egg white"] },
  { match: /^Chicken, broilers or fryers, breast, meat only, cooked, roasted$/, aliases: ["chicken breast", "chicken breast cooked", "grilled chicken breast"] },
  { match: /^Chicken, breast, boneless, skinless, raw$/, aliases: ["chicken breast raw"] },
  { match: /^Peanuts, all types, raw$/, aliases: ["moongphali", "groundnut"] },
  { match: /^Spices, turmeric, ground$/, aliases: ["haldi"] },
  { match: /^Spices, cumin seed$/, aliases: ["jeera"] },
  { match: /^Oil, coconut$/, aliases: ["coconut oil"] },
  { match: /^Oil, mustard$/, aliases: ["sarson ka tel"] },
  { match: /^Sweet potato, raw, unprepared( \(Includes foods for USDA's Food Distribution Program\))?$/, aliases: ["shakarkandi"] },
  { match: /^Potatoes, boiled, cooked without skin, flesh, without salt$/, aliases: ["aloo boiled"] },
  { match: /^Spinach, raw$/, aliases: ["palak"] },
  { match: /^Cauliflower, raw$/, aliases: ["gobi"] },
  { match: /^Okra, raw$/, aliases: ["bhindi"] },
  { match: /^Bananas, raw$/, aliases: ["banana", "bananas", "kela"] },
  { match: /^Apples, raw, with skin/, aliases: ["apple", "apples"] },
  { match: /^Beverages, coffee, brewed, prepared with tap water$/, aliases: ["coffee", "black coffee", "filter coffee decoction"] },
  // INDB dishes: the plain staple for a bare word.
  { match: /^Chapati\/Roti$/, aliases: ["roti", "chapati", "phulka", "rotis", "chapatis"] },
  { match: /^Plain dosa/i, aliases: ["dosa"] },
  { match: /^Plain parantha\/paratha/i, aliases: ["paratha", "parantha"] },
];

/** Aliases for a USDA or INDB description, plus which patterns were used (for the report). */
export function aliasesFor(description: string): { aliases: string[]; matched: number[] } {
  const aliases: string[] = [];
  const matched: number[] = [];
  USDA_ALIASES.forEach((a, i) => {
    if (a.match.test(description)) {
      aliases.push(...a.aliases);
      matched.push(i);
    }
  });
  return { aliases, matched };
}
