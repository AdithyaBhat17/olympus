/**
 * Food diary text → items with grams. The model only splits the text and
 * estimates portions; nutrients always come from the food database.
 * Pure parts (prompt, schema, validation, portion choice) live here so they
 * can be tested; the call and DB matching are in log-text.ts.
 */

export interface ParsedItem {
  /** What the person called it, e.g. "chicken tikka". */
  name: string;
  /** A short database query, e.g. "chicken tikka", "roti", "dal tadka". */
  search: string;
  quantity: number;
  unit: string;
  /** Model's estimate of total edible grams for this item. */
  grams: number;
  confidence: number;
}

export interface ParseResult {
  items: ParsedItem[];
}

export const PARSE_SCHEMA = {
  name: "food_items",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "search", "quantity", "unit", "grams", "confidence"],
          properties: {
            name: { type: "string" },
            search: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            grams: { type: "number" },
            confidence: { type: "number" },
          },
        },
      },
    },
  },
};

export function isParseResult(v: unknown): v is ParseResult {
  if (typeof v !== "object" || v === null || !Array.isArray((v as ParseResult).items)) return false;
  return (v as ParseResult).items.every(
    (i) =>
      typeof i === "object" &&
      typeof i.name === "string" &&
      typeof i.search === "string" &&
      typeof i.quantity === "number" &&
      typeof i.unit === "string" &&
      typeof i.grams === "number" &&
      typeof i.confidence === "number"
  );
}

export interface UsualPortion {
  name: string;
  grams: number;
  times: number;
}

export function parsePrompt(text: string, usual: UsualPortion[]): Array<{ role: "system" | "user"; content: string }> {
  const usualLines = usual.length
    ? `\nThis person's usual portions (from their own corrected logs; prefer these when the item matches):\n${usual
        .slice(0, 30)
        .map((u) => `- ${u.name}: ${Math.round(u.grams)} g`)
        .join("\n")}\n`
    : "";
  return [
    {
      role: "system",
      content: `You turn a food diary entry into a list of foods with portion weights.
Rules:
- One item per distinct food. Split combined phrases ("coffee with milk" = coffee + milk only if milk is a separate addition; "dal rice" = dal + rice).
- name: what the person called it, lowercase English (keep Indian dish names: roti, dal tadka, poha, paneer bhurji).
- search: 1-4 words to look it up in a food database (no quantities, no brands unless given).
- quantity + unit: as said ("2" + "roti", "150" + "g", "1" + "katori", "1" + "cup"). Use "serving" if none was said.
- grams: your best estimate of the total edible weight of this item, cooked as eaten. Grams said explicitly are exact.
  Typical Indian home portions: roti/chapati 40 g each, phulka 30 g, paratha 80 g, katori of dal/sabzi 150 g, bowl of rice 150 g, idli 40 g, dosa 100 g, cup of tea/coffee 150 ml, glass of milk 250 ml, tbsp ghee/oil 13 g, scoop of whey 31 g, 1 egg 50 g.
- confidence: 0-1, how sure you are of the grams (1 when the weight was given).
- Never estimate calories or nutrients.${usualLines}`,
    },
    { role: "user", content: text.slice(0, 1000) },
  ];
}

/** Clamp nonsense from the model. Returns null for an item that can't be used. */
export function cleanItem(i: ParsedItem): ParsedItem | null {
  const name = i.name.trim().toLowerCase().slice(0, 80);
  const search = (i.search.trim() || name).toLowerCase().slice(0, 60);
  if (!name || !Number.isFinite(i.grams) || i.grams <= 0 || i.grams > 3000) return null;
  return {
    name,
    search,
    quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 1,
    unit: i.unit.trim().toLowerCase().slice(0, 20) || "serving",
    grams: Math.round(i.grams),
    confidence: Math.min(1, Math.max(0, Number.isFinite(i.confidence) ? i.confidence : 0.5)),
  };
}

export interface PortionChoice {
  grams: number;
  /** Where the grams came from, shown on the confirm sheet. */
  basis: "stated" | "usual" | "portion" | "estimate";
}

/**
 * Grams to propose for a matched food. Order: a weight the person stated,
 * then their usual portion of that food, then the database's own portion for
 * the unit they used ("2 roti" × the food's "1 roti"), then the model's guess.
 */
export function chooseGrams(
  item: ParsedItem,
  portions: Array<{ label: string; grams: number }>,
  usualGrams: number | null
): PortionChoice {
  const unit = item.unit;
  if (unit === "g" || unit === "gram" || unit === "grams" || unit === "ml") return { grams: Math.round(item.quantity), basis: "stated" };
  if (usualGrams && (unit === "serving" || item.quantity === 1)) return { grams: Math.round(usualGrams * item.quantity), basis: "usual" };
  const unitWord = unit.replace(/e?s$/, "");
  const portion = portions.find((p) => {
    const l = p.label.toLowerCase();
    return unitWord.length > 1 && (l === `1 ${unitWord}` || l.startsWith(`1 ${unitWord} `) || l.includes(` ${unitWord}`));
  });
  if (portion && unit !== "serving") return { grams: Math.round(portion.grams * item.quantity), basis: "portion" };
  return { grams: item.grams, basis: "estimate" };
}

export interface ParseOutcome {
  /** Logged as drafted (grams within 5 g or 10 %). */
  kept: number;
  /** Same food, different grams. */
  regrammed: number;
  /** A drafted food replaced by another. */
  swapped: number;
  /** A drafted food dropped. */
  removed: number;
  /** A food that wasn't in the draft. */
  added: number;
}

/**
 * How the saved meal differs from the draft: the describe flow's quality
 * signal. Unmatched draft items (no food found) are counted separately by
 * the caller. A removal and an addition in the same meal count as a swap.
 */
export function parseOutcome(
  draft: Array<{ matchId: string | null; grams: number }>,
  final: Array<{ foodId: string; grams: number }>
): ParseOutcome {
  const left = [...final];
  let kept = 0;
  let regrammed = 0;
  let missing = 0;
  for (const d of draft) {
    if (!d.matchId) continue;
    const i = left.findIndex((f) => f.foodId === d.matchId);
    if (i < 0) {
      missing++;
      continue;
    }
    const [f] = left.splice(i, 1);
    if (Math.abs(f.grams - d.grams) <= Math.max(5, d.grams * 0.1)) kept++;
    else regrammed++;
  }
  const swapped = Math.min(missing, left.length);
  return { kept, regrammed, swapped, removed: missing - swapped, added: left.length - swapped };
}
