/** The athlete's timezone; "today" means today here, not on the server. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Dubai";

/** YYYY-MM-DD for `d` in the app timezone. */
export function isoDateInTz(d: Date = new Date(), tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayInTz(): string {
  return isoDateInTz(new Date());
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

/** "16:40" in the app timezone. */
export function formatTimeInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
