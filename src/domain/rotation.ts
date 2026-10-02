export const ROTATION = ["A", "B", "C"] as const;

/** `recentTypes` newest first; non-rotation types (Cardio) are skipped. */
export function nextSessionType(recentTypes: Array<string | null | undefined>): string {
  const last = recentTypes.find(
    (t): t is string => !!t && (ROTATION as readonly string[]).includes(t)
  );
  if (!last) return ROTATION[0];
  const i = ROTATION.indexOf(last as (typeof ROTATION)[number]);
  return ROTATION[(i + 1) % ROTATION.length];
}
