/**
 * A workout on a Watch or Garmin started alongside an Olympus session is the
 * same training seen twice. It counts as the session when they overlap for at
 * least half of the shorter of the two, so a run straight after lifting stays
 * its own activity.
 */

export interface Span {
  startMs: number;
  endMs: number;
}

export function sameTraining(a: Span, b: Span): boolean {
  const overlap = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
  const shorter = Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
  return shorter > 0 && overlap >= shorter / 2;
}

/** `activities` minus the ones that are an Olympus session recorded on a device too. */
export function outsideSessions<T extends Span>(activities: T[], sessions: Span[]): T[] {
  return activities.filter((a) => !sessions.some((s) => sameTraining(a, s)));
}

/**
 * Garmin Connect copies every workout into Apple Health, so a Garmin wearer
 * syncing both would see each one twice. Where a Garmin activity and an
 * Apple Health one are the same training, the Garmin one (richer: training
 * effect, 1 Hz HR) is kept.
 */
export function preferGarmin<T extends Span & { source: string }>(activities: T[]): T[] {
  const garmin = activities.filter((a) => a.source === "garmin");
  if (!garmin.length) return activities;
  return activities.filter((a) => a.source !== "apple_health" || !garmin.some((g) => sameTraining(a, g)));
}
