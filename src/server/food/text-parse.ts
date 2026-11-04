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
  /** "HH:mm" when the text said when ("at 9:30", "12pm"); "" from the model, null once cleaned. */
  time: string | null;
  /** The stack supplement this is ("Thyronorm"); "" from the model, null once cleaned. */
  supplement: string | null;
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
          required: ["name", "search", "quantity", "unit", "grams", "confidence", "time", "supplement"],
          properties: {
            name: { type: "string" },
            search: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            grams: { type: "number" },
            confidence: { type: "number" },
            time: { type: "string" },
            supplement: { type: "string" },
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
      typeof i.confidence === "number" &&
      typeof i.time === "string" &&
      typeof i.supplement === "string"
  );
}

export interface UsualPortion {
  name: string;
  grams: number;
  times: number;
}

export interface StackHint {
  name: string;
  /** What it is, so "thyroid tablet" finds "Thyronorm": its tags. */
  hint?: string;
}

export function parsePrompt(text: string, usual: UsualPortion[], stack: StackHint[] = []): Array<{ role: "system" | "user"; content: string }> {
  const usualLines = usual.length
    ? `\nThis person's usual portions (from their own corrected logs; prefer these when the item matches):\n${usual
        .slice(0, 30)
        .map((u) => `- ${u.name}: ${Math.round(u.grams)} g`)
        .join("\n")}\n`
    : "";
  const stackLines = stack.length
    ? `\nThis person's supplements and medication (use the exact name in "supplement" when the text means one of these, e.g. "thyroid tablet"):\n${stack
        .slice(0, 40)
        .map((s) => `- ${s.name}${s.hint ? ` (${s.hint})` : ""}`)
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
- grams: your best estimate of the total edible weight of this item in grams, cooked as eaten, never millilitres. Grams said explicitly are exact. For a liquid said in ml, convert with its density (milk 1.03 g/ml, oil 0.92, water/tea/coffee 1.0).
  Typical Indian home portions: roti/chapati 40 g each, phulka 30 g, paratha 80 g, katori of dal/sabzi 150 g, bowl of rice 150 g, idli 40 g, dosa 100 g, cup of tea/coffee 150 g, glass of milk 258 g (250 ml), tbsp ghee/oil 13 g, scoop of whey 31 g, 1 egg 50 g.
- confidence: 0-1, how sure you are of the grams (1 when the weight was given).
- time: when it was eaten, as 24-hour "HH:mm", only if the text says ("at 9:30" = "09:30", "12pm" = "12:00", "8 in the evening" = "20:00"). A time applies to the items after it until the next time. "" if no time was said.
- supplement: if the item is one of the supplements or medicines listed below, its exact name from the list; otherwise "". A supplement still gets quantity and unit; grams can be 0 for tablets.
- Never estimate calories or nutrients.${usualLines}${stackLines}`,
    },
    { role: "user", content: text.slice(0, 1000) },
  ];
}

/** Clamp nonsense from the model. Returns null for an item that can't be used. */
export function cleanItem(i: ParsedItem): ParsedItem | null {
  const name = i.name.trim().toLowerCase().slice(0, 80);
  const search = (i.search.trim() || name).toLowerCase().slice(0, 60);
  const supplement = i.supplement?.trim().slice(0, 120) || null;
  if (!name || !Number.isFinite(i.grams) || i.grams > 3000) return null;
  // A tablet has no grams; anything else needs a weight.
  if (i.grams <= 0 && !supplement) return null;
  return {
    name,
    search,
    quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? i.quantity : 1,
    unit: i.unit.trim().toLowerCase().slice(0, 20) || "serving",
    grams: Math.max(0, Math.round(i.grams)),
    confidence: Math.min(1, Math.max(0, Number.isFinite(i.confidence) ? i.confidence : 0.5)),
    time: cleanTime(i.time),
    supplement,
  };
}

/** "9:30" → "09:30"; anything that isn't a clock time → null. */
function cleanTime(t: string | null | undefined): string | null {
  const m = t?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * The stack entry the model named. Exact name first, then a name that
 * starts with it ("magnesium" → "Magnesium glycinate"). Never a guess
 * beyond that: a wrong supplement is worse than a food search.
 */
export function matchSupplement<T extends { id: string; name: string }>(said: string, stack: T[]): T | null {
  const q = said.trim().toLowerCase();
  if (!q) return null;
  return stack.find((s) => s.name.toLowerCase() === q) ?? stack.find((s) => s.name.toLowerCase().startsWith(q)) ?? null;
}

/** Items grouped by time: untimed first (they take the sheet's time), then in clock order. */
export function splitByTime<T extends { time?: string | null }>(items: T[]): Array<{ time: string | null; items: T[] }> {
  const groups = new Map<string | null, T[]>();
  for (const i of items) {
    const k = i.time ?? null;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
    .map(([time, items]) => ({ time, items }));
}

const ML_PER_UNIT: Record<string, number> = { ml: 1, millilitre: 1, milliliter: 1, millilitres: 1, milliliters: 1, l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000 };

/** The volume the person stated, in ml, or null if the unit isn't a volume. */
function stateMl(item: ParsedItem): number | null {
  const per = ML_PER_UNIT[item.unit];
  return per ? item.quantity * per : null;
}

/** US volume portions as written in USDA labels ("1 cup", "1 tablespoon", "1 fl oz"), in ml. */
const VOLUME_PORTIONS: Array<[RegExp, number]> = [
  [/^1 cup\b/, 236.588],
  [/^1 fl(uid)? oz\b/, 29.5735],
  [/^1 tablespoon\b/, 14.7868],
  [/^1 teaspoon\b/, 4.92892],
];

/** Grams per ml from the first volume portion the food has, or null. */
export function densityFromPortions(portions: Array<{ label: string; grams: number }>): number | null {
  for (const [re, ml] of VOLUME_PORTIONS) {
    const p = portions.find((x) => re.test(x.label.toLowerCase().trim()));
    if (p) {
      const d = p.grams / ml;
      if (d >= 0.2 && d <= 1.6) return d;
    }
  }
  return null;
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
  if (unit === "g" || unit === "gram" || unit === "grams") return { grams: Math.round(item.quantity), basis: "stated" };
  const ml = stateMl(item);
  if (ml !== null) {
    // 200 ml of milk is not 200 g: take the food's own density from a volume portion (a cup, a tbsp), else water's.
    const density = densityFromPortions(portions);
    return { grams: Math.round(ml * (density ?? 1)), basis: density ? "portion" : "estimate" };
  }
  if (usualGrams && (unit === "serving" || item.quantity === 1)) return { grams: Math.round(usualGrams * item.quantity), basis: "usual" };
  const UNIT_WORDS: Record<string, string> = { tbsp: "tablespoon", tbs: "tablespoon", tsp: "teaspoon", pc: "piece", pcs: "piece" };
  const unitWord = UNIT_WORDS[unit] ?? unit.replace(/e?s$/, "");
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
