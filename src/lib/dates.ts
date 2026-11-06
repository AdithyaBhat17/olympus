/**
 * Fallback for an athlete who hasn't reported a timezone yet. Each athlete's
 * own zone lives in athlete_profiles; "today" means today there.
 */
export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "UTC";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD for `d` in `tz`. */
export function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayInTz(tz: string): string {
  return isoDateInTz(new Date(), tz);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Fri 2 Oct" */
export function formatDayShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).replace(",", "");
}

/** "17/08" */
export function formatDdMm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "16:40" in `tz`. */
export function formatTimeInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Minutes east of UTC for `tz` at instant `d`. */
export function tzOffsetMin(d: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** "2024-06-28" + "21:20" in `tz` → the UTC instant. */
export function localToUtc(isoDate: string, hhmm: string, tz: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - tzOffsetMin(new Date(guess), tz) * 60_000;
  // Once more in case the first guess sat across a DST change.
  t = guess - tzOffsetMin(new Date(t), tz) * 60_000;
  return new Date(t);
}

/** The hour (0-23) on the wall clock in `tz` at instant `d`. */
export function localHour(d: Date, tz: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d);
  return Number(h) % 24;
}
