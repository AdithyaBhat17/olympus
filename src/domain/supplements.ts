/**
 * Supplements and medication timing. Pure: no I/O.
 *
 * Everything here is informational. Nudges are phrased as reminders with a
 * source, never as instructions, and missed doses are just data: nothing
 * here counts streaks.
 */

export type Slot = "waking" | "breakfast" | "lunch" | "pre_workout" | "post_workout" | "dinner" | "bedtime" | "any";

/** Slots in day order, with the local time a slot's one-tap log uses. */
export const SLOTS: Array<{ slot: Slot; label: string; time: string }> = [
  { slot: "waking", label: "On waking", time: "06:30" },
  { slot: "breakfast", label: "Breakfast", time: "08:30" },
  { slot: "lunch", label: "Lunch", time: "13:30" },
  { slot: "pre_workout", label: "Pre-workout", time: "17:30" },
  { slot: "post_workout", label: "Post-workout", time: "19:00" },
  { slot: "dinner", label: "Dinner", time: "20:30" },
  { slot: "bedtime", label: "Bedtime", time: "22:30" },
  { slot: "any", label: "Any time", time: "12:00" },
];

/** 0 = Sunday … 6 = Saturday for a yyyy-MM-dd date. */
export function weekday(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

/** Due on this date? Empty active_days means every day. */
export function isScheduled(activeDays: number[], isoDate: string): boolean {
  return activeDays.length === 0 || activeDays.includes(weekday(isoDate));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function scheduleLabel(activeDays: number[]): string {
  if (!activeDays.length || activeDays.length === 7) return "Daily";
  return [...activeDays].sort().map((d) => DAY_NAMES[d]).join(", ");
}

// --- Timing rules -------------------------------------------------------------------

export interface TimingRule {
  key: string;
  subjectTag: string;
  objectTag: string;
  minGapMin: number;
  direction: "after" | "either";
  message: string;
  citation: string;
}

export interface TimingEvent {
  id: string;
  /** Epoch ms. */
  at: number;
  /** Supplement tags; for food, its foods' tags plus "food". */
  tags: string[];
  label: string;
  /** For a meal: which item carries each tag ("coffee" → "Coffee"), so a nudge names the right thing. */
  labels?: Record<string, string>;
}

export interface Nudge {
  ruleKey: string;
  message: string;
  citation: string;
  /** Minutes between the two, and the gap the rule suggests. */
  gapMin: number;
  suggestedMin: number;
  subject: string;
  object: string;
}

/**
 * Nudges for rules broken by `added` against everything else in `existing`
 * (same day and neighbours). One nudge per rule and pair, closest pair first.
 */
export function checkTiming(rules: TimingRule[], added: TimingEvent[], existing: TimingEvent[]): Nudge[] {
  const all = [...existing.filter((e) => !added.some((a) => a.id === e.id)), ...added];
  const addedIds = new Set(added.map((a) => a.id));
  const out: Nudge[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    const subjects = all.filter((e) => e.tags.includes(r.subjectTag));
    const objects = all.filter((e) => e.tags.includes(r.objectTag));
    for (const s of subjects) {
      for (const o of objects) {
        if (s.id === o.id) continue;
        if (!addedIds.has(s.id) && !addedIds.has(o.id)) continue;
        const diff = Math.round((o.at - s.at) / 60_000);
        const broken = r.direction === "after" ? diff >= 0 && diff < r.minGapMin : Math.abs(diff) < r.minGapMin;
        const key = `${r.key}:${s.id}:${o.id}`;
        if (broken && !seen.has(key)) {
          seen.add(key);
          out.push({
            ruleKey: r.key,
            message: r.message,
            citation: r.citation,
            gapMin: Math.abs(diff),
            suggestedMin: r.minGapMin,
            subject: s.labels?.[r.subjectTag] ?? s.label,
            object: o.labels?.[r.objectTag] ?? o.label,
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.gapMin - b.gapMin);
}

/** "Thyronorm and Coffee were 25 min apart; about 60 min is usually suggested." */
export function nudgeText(n: Nudge): string {
  const gap = n.gapMin < 60 ? `${n.gapMin} min` : `${Math.round((n.gapMin / 60) * 10) / 10} h`;
  const want = n.suggestedMin < 60 ? `${n.suggestedMin} min` : `${n.suggestedMin / 60} h`;
  return `${n.subject} and ${n.object} were ${gap} apart; about ${want} is usually suggested. ${n.message}`;
}

/** Rules with a user's overrides applied (same key wins; disabled ones dropped). */
export function effectiveRules<T extends TimingRule & { userId: string | null; enabled: boolean }>(rows: T[]): TimingRule[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const prev = byKey.get(r.key);
    if (!prev || (prev.userId === null && r.userId !== null)) byKey.set(r.key, r);
  }
  return [...byKey.values()].filter((r) => r.enabled);
}

// --- Inventory ------------------------------------------------------------------------

export interface InventoryEvent {
  at: number;
  kind: "restock" | "count" | "dose";
  /** Servings added (restock), set (count) or used (dose). */
  servings: number;
}

/** Servings left after replaying restocks, counts and doses in time order. Null if never stocked. */
export function servingsLeft(events: InventoryEvent[]): number | null {
  let left: number | null = null;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.kind === "count") left = e.servings;
    else if (e.kind === "restock") left = (left ?? 0) + e.servings;
    else if (left !== null) left -= e.servings;
  }
  return left === null ? null : Math.max(0, Math.round(left * 10) / 10);
}

/** Days of supply at the scheduled rate. */
export function daysLeft(left: number | null, servingsPerDose: number, activeDays: number[]): number | null {
  if (left === null) return null;
  const perWeek = servingsPerDose * (activeDays.length || 7);
  if (perWeek <= 0) return null;
  return Math.floor(left / (perWeek / 7));
}

export const REFILL_WARN_DAYS = 10;

// --- Labs -------------------------------------------------------------------------

export interface MarkerInfo {
  label: string;
  unit: string;
  /** Typical retest interval when stable, days. Informational; your doctor decides. */
  retestDays: number;
  thyroid?: boolean;
}

export const MARKERS: Record<string, MarkerInfo> = {
  TSH: { label: "TSH", unit: "mIU/L", retestDays: 180, thyroid: true },
  FT4: { label: "Free T4", unit: "ng/dL", retestDays: 180, thyroid: true },
  FT3: { label: "Free T3", unit: "pg/mL", retestDays: 180, thyroid: true },
  ANTI_TPO: { label: "Anti-TPO", unit: "IU/mL", retestDays: 365, thyroid: true },
  "25OHD": { label: "Vitamin D (25-OH)", unit: "ng/mL", retestDays: 90 },
  MG: { label: "Magnesium (serum)", unit: "mg/dL", retestDays: 180 },
  FERRITIN: { label: "Ferritin", unit: "ng/mL", retestDays: 180 },
  B12: { label: "Vitamin B12", unit: "pg/mL", retestDays: 365 },
  SELENIUM: { label: "Selenium", unit: "µg/L", retestDays: 365 },
  HSCRP: { label: "hs-CRP", unit: "mg/L", retestDays: 365 },
  HBA1C: { label: "HbA1c", unit: "%", retestDays: 365 },
  LDL: { label: "LDL cholesterol", unit: "mg/dL", retestDays: 365 },
};

/** When a marker is next due, from its last draw. */
export function retestDue(marker: string, lastDrawn: string | null): string | null {
  const info = MARKERS[marker];
  if (!info || !lastDrawn) return null;
  const d = new Date(`${lastDrawn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + info.retestDays);
  return d.toISOString().slice(0, 10);
}

export interface ChecklistSupplement {
  name: string;
  tags: string[];
}

export interface ChecklistItem {
  /** When to start doing this (epoch ms). */
  from: number;
  text: string;
  source?: string;
}

const H = 3_600_000;

/**
 * What to do before a blood test. Informational: always follow the lab's and
 * your doctor's instructions, which win over anything here.
 */
export function labChecklist(
  appt: { at: number; markers: string[]; fasting: boolean; thyroidMedInstruction?: string | null },
  stack: ChecklistSupplement[]
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const thyroid = appt.markers.some((m) => MARKERS[m]?.thyroid);
  const biotin = stack.filter((s) => s.tags.includes("biotin") || s.tags.includes("multivitamin"));
  if (thyroid && biotin.length) {
    items.push({
      from: appt.at - 72 * H,
      text: `Pause ${biotin.map((s) => s.name).join(" and ")} from 72 hours before: biotin can skew thyroid tests (TSH, free T4). Check the label for biotin.`,
      source: "Li D et al. Association of biotin ingestion with performance of hormone and nonhormone assays in healthy adults. JAMA 2017;318(12):1150–1160; FDA safety communication on biotin and lab tests (2017, updated 2019).",
    });
  }
  if (appt.markers.includes("HSCRP")) {
    items.push({
      from: appt.at - 48 * H,
      text: "No hard training for 48 hours before: strenuous exercise raises CRP for a day or two.",
      source: "Kasapis C, Thompson PD. The effects of physical activity on serum C-reactive protein and inflammatory markers. J Am Coll Cardiol 2005;45(10):1563–1569.",
    });
  }
  if (thyroid) {
    items.push({
      from: appt.at - 24 * H,
      text: appt.thyroidMedInstruction?.trim()
        ? `Thyroid medicine on test day: ${appt.thyroidMedInstruction.trim()}`
        : "Thyroid medicine on test day: ask your doctor whether to take it before or after the draw, and note it here.",
    });
  }
  if (appt.fasting) {
    items.push({ from: appt.at - 12 * H, text: "Fasting test: water only for the 10–12 hours before, unless the lab says otherwise." });
  }
  return items.sort((a, b) => a.from - b.from);
}

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

/** "16–21 min", "30 min–4 h", "2–4 h": the unit once when both ends share it. */
function fmtRange(lo: number, hi: number): string {
  if (lo === hi) return lo < 60 ? `${lo} min` : `${hours(lo)} h`;
  if (hi < 60) return `${lo}–${hi} min`;
  if (lo >= 60) return `${hours(lo)}–${hours(hi)} h`;
  return `${lo} min–${hours(hi)} h`;
}

/**
 * One calm line for any number of nudges: what was close to what, and the
 * usual spacing. Null when there's nothing to say. Details live with the
 * rules (Supplements › Timing rules), each with its source.
 */
export function nudgeSummary(nudges: Nudge[]): string | null {
  if (!nudges.length) return null;
  if (nudges.length === 1) return nudgeText(nudges[0]);
  const subject = nudges[0].subject;
  // A meal arrives as "egg + yogurt + banana" and a single food rule may name
  // one of those again: list each food once, first spelling wins.
  const seen = new Map<string, string>();
  for (const n of nudges.filter((x) => x.subject === subject)) {
    for (const part of n.object.split(" + ").map((p) => p.trim()).filter(Boolean)) {
      if (!seen.has(part.toLowerCase())) seen.set(part.toLowerCase(), part);
    }
  }
  const objects = [...seen.values()];
  const list = objects.length > 1 ? `${objects.slice(0, -1).join(", ")} and ${objects.at(-1)}` : objects[0];
  const gaps = nudges.map((n) => n.gapMin);
  const want = nudges.map((n) => n.suggestedMin);
  const when = Math.max(...gaps) < 5 ? `taken with ${list}` : `${fmtRange(Math.min(...gaps), Math.max(...gaps))} from ${list}`;
  return `${subject} was ${when}. They're usually kept ${fmtRange(Math.min(...want), Math.max(...want))} apart. Details and sources: Supplements › Timing rules.`;
}

/**
 * Tags to suggest from a supplement's name, so timing warnings work without the
 * user knowing the tags drive them. Only obvious names; never guesses a drug.
 */
const TAG_HINTS: Array<[RegExp, string]> = [
  [/\b(thyronorm|levothyrox\w*|eltroxin|synthroid|euthyrox|thyroxine|thyrox)\b/i, "levothyroxine"],
  [/\bcalcium\b/i, "calcium"],
  [/\b(iron|ferrous|ferrum)\b/i, "iron"],
  [/\bmagnesium\b/i, "magnesium"],
  [/\b(multivit\w*|multi-vit\w*)\b/i, "multivitamin"],
  [/\bbiotin\b/i, "biotin"],
  [/\b(vitamin d3?|cholecalciferol)\b/i, "vitamin_d"],
  [/\bselenium\b/i, "selenium"],
  [/\bcreatine\b/i, "creatine"],
  [/\bcollagen\b/i, "collagen"],
  [/\b(whey|protein)\b/i, "protein"],
];

export function suggestTags(name: string): string[] {
  return [...new Set(TAG_HINTS.filter(([re]) => re.test(name)).map(([, tag]) => tag))];
}
