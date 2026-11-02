/**
 * Every documented Personal API endpoint (OpenAPI 3.0.1 "Garmin Connect
 * Personal API" 1.0.0, read 2026-11-03 from
 * developer.garmin.com/gc-developer-program/personal/swagger-docs), and how
 * to call each one for a window of days.
 *
 * Shapes:
 * - once: no date (profile, HR zones), or one date (fitness age)
 * - range: one call for a from/to window (path or query params). A window
 *   the API rejects is retried in smaller chunks by the caller.
 * - daily: one call per calendar date
 * - activity: per activity id, from the activity list
 */

export type EndpointShape =
  | { kind: "once"; query?: Record<string, string | boolean> }
  | { kind: "onceForDate"; param: "path" | "query"; name: string }
  | { kind: "range"; params: "path" | "query"; from: string; to: string; maxDays?: number; query?: Record<string, string | boolean> }
  | { kind: "daily"; param: "path" | "query"; name: string; sampleDays?: number; query?: Record<string, string | boolean> }
  | { kind: "activity" };

export interface GarminEndpoint {
  /** Stable id, used as the raw_garmin.endpoint value and folder name. */
  id: string;
  path: string;
  group: "activity" | "health" | "profile";
  shape: EndpointShape;
  /** What we want from it. */
  why: string;
}

export const GARMIN_ENDPOINTS: GarminEndpoint[] = [
  // --- Profile -------------------------------------------------------------
  { id: "profile.settings", path: "/userprofile-service/userprofile/settings", group: "profile", shape: { kind: "once" }, why: "timezone, units, user max/resting HR, sleep window" },
  { id: "hr.zones", path: "/biometric-service/heartRateZones/v2", group: "profile", shape: { kind: "once" }, why: "Garmin's zones (we use custom Zone 2 130-140)" },
  { id: "fitness.age", path: "/fitnessage-service/fitnessage/v2/{calendarDate}", group: "health", shape: { kind: "onceForDate", param: "path", name: "calendarDate" }, why: "fitness age, VO2-ish components" },

  // --- Health, ranges --------------------------------------------------------
  { id: "hrv.daily", path: "/hrv-service/hrv/daily/{fromDate}/{toDate}", group: "health", shape: { kind: "range", params: "path", from: "fromDate", to: "toDate" }, why: "overnight HRV + Garmin baseline: recovery score input" },
  { id: "sleep.summaries", path: "/sleep-service/sleep/dailySleepSummariesByDate", group: "health", shape: { kind: "range", params: "query", from: "startDate", to: "endDate" }, why: "sleep duration, stages, score, sleep need" },
  { id: "summary.v2", path: "/usersummary-service/v2/dailysummaries", group: "health", shape: { kind: "range", params: "query", from: "startDate", to: "endDate" }, why: "RHR, stress, Body Battery, respiration, SpO2, jet lag" },
  { id: "stress.daily", path: "/usersummary-service/stats/stress/daily/{startDate}/{endDate}", group: "health", shape: { kind: "range", params: "path", from: "startDate", to: "endDate" }, why: "daily stress: energy bank input" },
  { id: "bodybattery.daily", path: "/wellness-service/wellness/bodyBattery/reports/daily", group: "health", shape: { kind: "range", params: "query", from: "startDate", to: "endDate" }, why: "Body Battery charged/drained" },
  { id: "steps.daily", path: "/usersummary-service/stats/steps/daily/{startDate}/{endDate}", group: "health", shape: { kind: "range", params: "path", from: "startDate", to: "endDate" }, why: "steps (NEAT for adaptive TDEE)" },
  { id: "hydration.daily", path: "/usersummary-service/stats/hydration/daily/{startDate}/{endDate}", group: "health", shape: { kind: "range", params: "path", from: "startDate", to: "endDate" }, why: "hydration if logged in Connect" },
  { id: "weight.range", path: "/weight-service/weight/range/{startDate}/{endDate}", group: "health", shape: { kind: "range", params: "path", from: "startDate", to: "endDate", query: { includeAll: true } }, why: "weigh-ins / body comp from an Index scale or manual" },
  { id: "weight.all", path: "/weight-service/weight/all/{startDate}/{endDate}", group: "health", shape: { kind: "range", params: "path", from: "startDate", to: "endDate" }, why: "every weigh-in in the window" },
  { id: "weight.goal", path: "/goal-service/goal/user/effective/weightgoal/{startDate}/{endDate}", group: "health", shape: { kind: "range", params: "path", from: "startDate", to: "endDate" }, why: "weight goal set in Connect" },
  { id: "wellness.activity", path: "/wellnessactivity-service/activity/summary/range/{fromDate}/{untilDate}", group: "activity", shape: { kind: "range", params: "path", from: "fromDate", to: "untilDate" }, why: "time-in-zone summaries" },

  // --- Health, per day -------------------------------------------------------
  { id: "hrv.day", path: "/hrv-service/hrv/{calendarDate}", group: "health", shape: { kind: "daily", param: "path", name: "calendarDate" }, why: "per-night HRV readings (5-min), status, baseline" },
  { id: "sleep.day", path: "/sleep-service/sleep/dailySleep", group: "health", shape: { kind: "daily", param: "query", name: "date" }, why: "per-night sleep detail: stages, timings, skin temp?, respiration?" },
  { id: "hr.day", path: "/wellness-service/wellness/dailyHeartRate", group: "health", shape: { kind: "daily", param: "query", name: "date" }, why: "intraday HR, RHR" },
  { id: "summary.day", path: "/usersummary-service/usersummary/daily", group: "health", shape: { kind: "daily", param: "query", name: "calendarDate" }, why: "v1 daily summary (compare with v2)" },
  { id: "spo2.day", path: "/wellness-service/wellness/daily/spo2acclimation/{calendarDate}", group: "health", shape: { kind: "daily", param: "path", name: "calendarDate", sampleDays: 7 }, why: "SpO2 if the Instinct 2 measures it" },
  { id: "nutrition.day", path: "/nutrition-service/food/logs/{date}", group: "health", shape: { kind: "daily", param: "path", name: "date", sampleDays: 7, query: { includeGoals: true, includeNutrition: true } }, why: "only if food is logged in Connect" },

  // --- Activities ------------------------------------------------------------
  { id: "activity.detail", path: "/activity-service/activity/{activityId}", group: "activity", shape: { kind: "activity" }, why: "summary, training effect, HR zones" },
  { id: "activity.workouts", path: "/activity-service/activity/{activityId}/workouts", group: "activity", shape: { kind: "activity" }, why: "structured workout attached to it" },
  { id: "activity.file", path: "/download-service/files/activity/{activityId}", group: "activity", shape: { kind: "activity" }, why: "ZIP with the FIT: 1 Hz HR, laps, strength sets" },
];

/**
 * Not called: women's health (periodichealth-service menstrualcycle summary
 * and dayview). Documented, irrelevant here; listed so the report is honest
 * about what was skipped.
 */
export const SKIPPED_ENDPOINTS = [
  "/periodichealth-service/menstrualcycle/summary/{calendarDate}",
  "/periodichealth-service/menstrualcycle/dayview/{calendarDate}",
];

export const ACTIVITY_LIST_PATH = "/activitylist-service/activities/search/activities";

/** Fill `{name}` placeholders. */
export function fillPath(path: string, values: Record<string, string | number>): string {
  return path.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (values[k] === undefined) throw new Error(`No value for {${k}} in ${path}`);
    return encodeURIComponent(String(values[k]));
  });
}

/** yyyy-MM-dd + n days (UTC arithmetic on calendar dates). */
export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `from` to `to`. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

/** Split an inclusive window into chunks of at most `size` days. */
export function chunkWindow(from: string, to: string, size: number): Array<[string, string]> {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: Array<[string, string]> = [];
  for (let start = from; start <= to; start = addDaysIso(start, size)) {
    const end = addDaysIso(start, size - 1);
    out.push([start, end < to ? end : to]);
  }
  return out;
}

/** Path + query for one range call. */
export function rangeRequest(
  ep: GarminEndpoint,
  from: string,
  to: string
): { path: string; query: Record<string, string | boolean> } {
  if (ep.shape.kind !== "range") throw new Error(`${ep.id} is not a range endpoint`);
  const s = ep.shape;
  if (s.params === "path") {
    return { path: fillPath(ep.path, { [s.from]: from, [s.to]: to }), query: { ...(s.query ?? {}) } };
  }
  return { path: ep.path, query: { ...(s.query ?? {}), [s.from]: from, [s.to]: to } };
}

/** Path + query for one per-date call. */
export function dateRequest(
  ep: GarminEndpoint,
  date: string
): { path: string; query: Record<string, string | boolean> } {
  const s = ep.shape;
  if (s.kind !== "daily" && s.kind !== "onceForDate") throw new Error(`${ep.id} is not a per-date endpoint`);
  const extra = s.kind === "daily" ? (s.query ?? {}) : {};
  if (s.param === "path") return { path: fillPath(ep.path, { [s.name]: date }), query: { ...extra } };
  return { path: ep.path, query: { ...extra, [s.name]: date } };
}
