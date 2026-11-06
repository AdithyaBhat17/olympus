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

const RICHNESS = ["garmin", "whoop", "apple_health"];
const rank = (source: string) => {
  const i = RICHNESS.indexOf(source);
  return i === -1 ? RICHNESS.length : i;
};

/**
 * Garmin Connect and Whoop both copy every workout into Apple Health, and
 * someone wearing both devices records the same training twice. Where
 * activities from different sources are the same training, the richest one is
 * kept: Garmin (training effect, 1 Hz HR), then Whoop (strain, HR), then
 * Apple Health. Same-source activities are never merged here.
 */
export function preferRicherSource<T extends Span & { source: string }>(activities: T[]): T[] {
  const kept: T[] = [];
  // Richest first, and each activity is checked only against ones that survive,
  // so a dropped duplicate can't hide a different workout.
  for (const a of [...activities].sort((x, y) => rank(x.source) - rank(y.source))) {
    if (!kept.some((k) => rank(k.source) < rank(a.source) && sameTraining(a, k))) kept.push(a);
  }
  return activities.filter((a) => kept.includes(a));
}
