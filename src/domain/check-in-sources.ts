/**
 * Where a check-in value came from, and which source may overwrite which.
 *
 * Wearable fields (sleep, HRV, resting HR) are one fact per day, so the best
 * device wins and a value the athlete typed (or told Claude) beats every sync.
 * Device order: Garmin, then Whoop, then Apple Health. Apple Health is last
 * because for a Garmin or Whoop wearer it only holds a copy (Garmin Connect
 * writes sleep and resting HR there, but never HRV), and its HRV is SDNN from
 * a Watch, which isn't comparable with the RMSSD the other two report.
 *
 * Protein and water accumulate through the day: a sync may raise a human
 * value (they kept logging elsewhere) but never lower it. MyFitnessPal's
 * database is the better one, so a day's protein from Apple Health (MFP writes
 * it there) outranks the Olympus food log; the food log only fills days Health
 * has no protein for, and never overwrites a day Health already filled.
 */

export const SYNC_SOURCES = ["garmin", "whoop", "apple_health"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];
export type HumanSource = "manual" | "claude";
/** Protein summed from the food log: the fallback for days Apple Health has none. */
export type FoodLogSource = "food_log";
export type CheckInSource = HumanSource | SyncSource | FoodLogSource;
export type CheckInField = "sleep" | "protein" | "water" | "hrv" | "rhr";

export function isSyncSource(s: string | undefined | null): s is SyncSource {
  return (SYNC_SOURCES as readonly string[]).includes(s ?? "");
}

export function isHumanSource(s: string | undefined | null): s is HumanSource {
  return s === "manual" || s === "claude";
}

/** 0 = best. Unknown sources rank last. */
function rank(s: SyncSource): number {
  return SYNC_SOURCES.indexOf(s);
}

/** True when a value from `incoming` may replace one from `existing`. */
export function syncOutranks(incoming: SyncSource, existing: CheckInSource | undefined): boolean {
  if (existing == null) return true;
  if (isHumanSource(existing) || existing === "food_log") return false;
  return rank(incoming) <= rank(existing);
}

export const SOURCE_LABEL: Record<CheckInSource, string> = {
  food_log: "Food log",
  garmin: "Garmin",
  whoop: "Whoop",
  apple_health: "Apple Health",
  claude: "Claude",
  manual: "Manual",
};

/**
 * What a day's HRV number measures. Garmin's overnight HRV and Whoop's are
 * RMSSD; Apple Health stores SDNN. A typed value is unknown. Never compare
 * or baseline across methods.
 */
export type HrvMethod = "rmssd" | "sdnn";
export function hrvMethod(source: CheckInSource | undefined): HrvMethod | null {
  if (source === "garmin" || source === "whoop") return "rmssd";
  if (source === "apple_health") return "sdnn";
  return null;
}

export interface SyncPatch {
  sleepMin?: number | null;
  proteinG?: number | null;
  waterMl?: number | null;
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepDetail?: unknown;
}

export interface ExistingCheckIn {
  sources: Partial<Record<CheckInField, CheckInSource>>;
  proteinG: number | null;
  waterMl: number | null;
  /** Which device the stored sleep detail came from. */
  sleepDetailSource: SyncSource | null;
}

/**
 * The part of `patch` a sync from `source` may write over `existing`.
 * Returns a new object; fields it may not write are left out.
 */
export function filterSyncPatch<P extends SyncPatch>(
  patch: P,
  existing: ExistingCheckIn | null,
  source: SyncSource
): P {
  const out = { ...patch };
  if (!existing) return out;
  const { sources } = existing;

  if (!syncOutranks(source, sources.sleep)) delete out.sleepMin;
  if (!syncOutranks(source, sources.hrv)) delete out.hrvMs;
  if (!syncOutranks(source, sources.rhr)) delete out.restingHr;
  // Nobody types their REM minutes, so detail only follows the device order.
  if (existing.sleepDetailSource && !syncOutranks(source, existing.sleepDetailSource)) {
    delete out.sleepDetail;
  }

  // Accumulating fields: a sync may raise a human value but never lower it.
  // Protein from the food log is only a fallback: Apple Health (MFP's numbers)
  // replaces it, Garmin and Whoop never carry protein so they leave it alone.
  if (sources.protein === "food_log") {
    if (source !== "apple_health") delete out.proteinG;
  } else if (isHumanSource(sources.protein) && (out.proteinG ?? -1) <= (existing.proteinG ?? -1)) {
    delete out.proteinG;
  }
  if (isHumanSource(sources.water) && (out.waterMl ?? -1) <= (existing.waterMl ?? -1)) {
    delete out.waterMl;
  }
  return out;
}
