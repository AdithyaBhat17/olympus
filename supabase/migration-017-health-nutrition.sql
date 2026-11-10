-- Olympus: daily nutrition from Apple Health. Idempotent, additive.
--
-- MyFitnessPal writes nutrition into Apple Health; the iOS app reads it and
-- sends one row per day. `nutrients` holds whichever dietary types had data
-- (kcal, proteinG, sodiumMg, ...; keys in src/domain/health-nutrition.ts), so
-- the table needs no change when MFP writes a new one. It is the primary
-- source for a day's nutrition; the food log is the fallback.

CREATE TABLE IF NOT EXISTS health_nutrition_days (
  user_id    TEXT        NOT NULL,
  date       DATE        NOT NULL,
  nutrients  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
