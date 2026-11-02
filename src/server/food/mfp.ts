/**
 * MyFitnessPal "File Export" → Olympus history. Pure: no I/O.
 *
 * The export holds meal totals, not individual foods:
 * - Nutrition-Summary-*.csv: one row per meal entry (Date, Meal, optional
 *   Time like "9:20 PM", Calories, Fat (g), Carbohydrates (g), Fiber,
 *   Protein (g), …). A meal can appear several times a day at different times.
 * - Measurement-Summary-*.csv: Date, Body Fat %, Hips, Neck, Waist, Weight.
 * - Exercise-Summary-*.csv is ignored: Olympus and Garmin own training.
 */
import type { Meal } from "@/domain/nutrition";

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function records(text: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const n = (v: string | undefined): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x * 10) / 10 : 0;
};
const opt = (v: string | undefined): number | null => {
  const x = Number(v);
  return v && Number.isFinite(x) && x > 0 ? x : null;
};

/** "9:20 PM" → "21:20"; null when missing or unreadable. */
export function to24h(t: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec((t ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** MFP meal name → Olympus meal, and a typical time when the row has none. */
export function mapMeal(mfpMeal: string): { meal: Meal; defaultTime: string } {
  const m = mfpMeal.toLowerCase();
  if (m === "breakfast") return { meal: "breakfast", defaultTime: "08:30" };
  if (m === "lunch") return { meal: "lunch", defaultTime: "13:30" };
  if (m === "dinner") return { meal: "dinner", defaultTime: "20:30" };
  if (m.includes("morning")) return { meal: "snack", defaultTime: "11:00" };
  if (m.includes("afternoon")) return { meal: "snack", defaultTime: "16:30" };
  if (m.includes("evening")) return { meal: "snack", defaultTime: "17:30" };
  return { meal: "snack", defaultTime: "16:00" };
}

export interface MfpMeal {
  date: string;
  /** Local "HH:mm". */
  time: string;
  timeKnown: boolean;
  meal: Meal;
  mfpMeal: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  /** Idempotency key: same row, same key on every import. */
  externalRef: string;
}

export function parseMfpNutrition(csv: string): MfpMeal[] {
  const out: MfpMeal[] = [];
  const seen = new Map<string, number>();
  for (const r of records(csv)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.Date ?? "") || !r.Meal) continue;
    const { meal, defaultTime } = mapMeal(r.Meal);
    const known = to24h(r.Time);
    const base = `mfp:${r.Date}:${r.Meal}:${known ?? "-"}`;
    // Two rows with the same date, meal and time stay two entries.
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    out.push({
      date: r.Date,
      time: known ?? defaultTime,
      timeKnown: known !== null,
      meal,
      mfpMeal: r.Meal,
      kcal: n(r.Calories),
      protein: n(r["Protein (g)"]),
      carbs: n(r["Carbohydrates (g)"]),
      fat: n(r["Fat (g)"]),
      fibre: n(r.Fiber),
      externalRef: k === 1 ? base : `${base}#${k}`,
    });
  }
  return out;
}

export interface MfpMeasurement {
  date: string;
  kg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  neckCm: number | null;
  hipsCm: number | null;
}

/**
 * MFP stores measurements in the units the account was set to. This account
 * logged kg (values like 74.0, 82.0); a value that only makes sense in pounds
 * is converted.
 */
export function parseMfpMeasurements(csv: string): MfpMeasurement[] {
  return records(csv)
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.Date ?? ""))
    .map((r) => {
      const w = opt(r.Weight);
      return {
        date: r.Date,
        kg: w == null ? null : w > 200 ? Math.round((w / 2.20462) * 100) / 100 : w,
        bodyFatPct: opt(r["Body Fat %"]),
        waistCm: opt(r.Waist),
        neckCm: opt(r.Neck),
        hipsCm: opt(r.Hips),
      };
    })
    .filter((m) => m.kg != null || m.bodyFatPct != null || m.waistCm != null);
}
