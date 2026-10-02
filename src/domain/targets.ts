/** Nutrition + recovery targets. Protein is a floor, not a range. */
export const TARGETS = {
  kcal: 1700,
  proteinG: 155,
  waterMl: 3500,
  minSleepMin: 6 * 60,
} as const;

export const DEFAULT_REST_SEC = { compound: 180, accessory: 90 } as const;
