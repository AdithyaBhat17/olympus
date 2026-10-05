/** A new athlete's rotation until they set their own (athlete_profiles.rotation). */
export const DEFAULT_ROTATION = ["A", "B", "C"] as const;

/** Rotation sessions are single letters: they fit the Today pills and "Session X". */
export const ROTATION_LETTER = /^[A-Z]$/;
export const MAX_ROTATION = 6;

/** `recentTypes` newest first; types outside the rotation (Cardio) are skipped. */
export function nextSessionType(
  recentTypes: Array<string | null | undefined>,
  rotation: readonly string[] = DEFAULT_ROTATION
): string {
  const last = recentTypes.find((t): t is string => !!t && rotation.includes(t));
  if (!last) return rotation[0];
  return rotation[(rotation.indexOf(last) + 1) % rotation.length];
}

/** "a, B ,c" → ["A", "B", "C"], or an error to show the athlete. */
export function parseRotation(input: string | readonly string[]): { rotation: string[] } | { error: string } {
  const parts = (typeof input === "string" ? input.split(/[\s,]+/) : [...input])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) return { error: "Add at least one session letter" };
  if (parts.length > MAX_ROTATION) return { error: `At most ${MAX_ROTATION} sessions in a rotation` };
  const bad = parts.find((p) => !ROTATION_LETTER.test(p));
  if (bad) return { error: `"${bad}" isn't a single letter. Use A, B, C…` };
  if (new Set(parts).size !== parts.length) return { error: "Each session letter can appear once" };
  return { rotation: parts };
}
