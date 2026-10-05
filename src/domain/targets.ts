/**
 * An athlete's nutrition + recovery targets (athlete_profiles). Protein is a
 * floor, not a range. A null target isn't tracked: nothing is judged against it.
 */
export interface Targets {
  kcal: number | null;
  proteinG: number | null;
  waterMl: number | null;
  /** Sleep floor for the progression gate. */
  minSleepMin: number;
}

/** A new athlete: only the sleep gate applies until they set targets. */
export const DEFAULT_TARGETS: Targets = {
  kcal: null,
  proteinG: null,
  waterMl: null,
  minSleepMin: 6 * 60,
};

export const DEFAULT_REST_SEC = { compound: 180, accessory: 90 } as const;
