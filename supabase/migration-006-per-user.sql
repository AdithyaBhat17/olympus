-- Olympus: everything that was one athlete's becomes per-user, so the app can
-- be shared. Idempotent. Safe to run BEFORE deploying the code that needs it:
-- the old code still reads constraints by user_id and global exercise status,
-- and neither is taken away here.
--
-- The athlete who owns the existing data. Change it if you deploy for someone else.
--   evilpotato345@gmail.com

-- Profiles: timezone, nutrition targets, sleep floor, rotation -----------------
CREATE TABLE IF NOT EXISTS athlete_profiles (
  user_id TEXT PRIMARY KEY,
  timezone TEXT,
  kcal INTEGER CHECK (kcal BETWEEN 800 AND 8000),
  protein_g INTEGER CHECK (protein_g BETWEEN 0 AND 500),
  water_ml INTEGER CHECK (water_ml BETWEEN 0 AND 10000),
  min_sleep_min INTEGER NOT NULL DEFAULT 360 CHECK (min_sleep_min BETWEEN 180 AND 720),
  rotation TEXT[] NOT NULL DEFAULT ARRAY['A', 'B', 'C'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What used to be hard-coded (APP_TIMEZONE, src/domain/targets.ts).
INSERT INTO athlete_profiles (user_id, timezone, kcal, protein_g, water_ml, min_sleep_min, rotation)
VALUES ('evilpotato345@gmail.com', 'Asia/Dubai', 1700, 155, 3500, 360, ARRAY['A', 'B', 'C'])
ON CONFLICT (user_id) DO NOTHING;

-- Constraints: no more rows that apply to everyone ---------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_constraints_user_region
  ON constraints(user_id, region) WHERE user_id IS NOT NULL;

UPDATE constraints SET user_id = 'evilpotato345@gmail.com' WHERE user_id IS NULL;

-- Exercise blocks: "NO" in the shared library becomes one athlete's choice ----
CREATE TABLE IF NOT EXISTS exercise_blocks (
  user_id TEXT NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

INSERT INTO exercise_blocks (user_id, exercise_id, reason)
SELECT 'evilpotato345@gmail.com', id, blocked_reason
FROM exercises
WHERE status = 'NO' AND created_by IS NULL
ON CONFLICT (user_id, exercise_id) DO NOTHING;

-- The new code ignores status = 'NO' on shared rows, so they're left as they
-- are: the code running now still needs them until the deploy lands.
