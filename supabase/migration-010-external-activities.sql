-- Olympus: training done outside the app (runs, rides, classes), from Apple
-- Health workouts, so Claude can see yesterday's 10k before programming squats.
-- Idempotent. Run BEFORE deploying the code that writes it.
--
-- The iOS app sends every workout in a time range; rows in that range it no
-- longer sends (deleted in Health, or a duplicate of another device's copy)
-- are removed. Workouts overlapping an Olympus session are kept but not shown
-- to Claude: they're the same training.

CREATE TABLE IF NOT EXISTS external_activities (
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  activity_type TEXT NOT NULL,
  device TEXT,
  duration_min INTEGER NOT NULL,
  distance_m INTEGER,
  active_kcal INTEGER,
  avg_hr INTEGER,
  max_hr INTEGER,
  hr_covered_min INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_activities_user_start
  ON external_activities (user_id, started_at);
