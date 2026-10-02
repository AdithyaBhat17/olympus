-- Migration 004: cardio (time-based) exercises, slugs for every global
-- exercise, and the lumbar rule covering every session. Idempotent.
-- Run the ALTER TYPE on its own first (Postgres won't use a new enum value in
-- the same transaction that adds it).

ALTER TYPE exercise_category ADD VALUE IF NOT EXISTS 'Cardio';

-- TIME: a set is minutes (reps = minutes, weight = 0). Speed/incline/HR live
-- in the plan cues; avg HR can be logged per block.
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_load_mode_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_load_mode_check
  CHECK (load_mode IN ('TOTAL', 'PER_SIDE', 'COUNTERWEIGHT', 'TIME'));

-- One stable id Claude can use everywhere: backfill slugs from names.
UPDATE exercises e
SET slug = s.slug
FROM (
  SELECT id, trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) AS slug
  FROM exercises
  WHERE slug IS NULL AND created_by IS NULL
) s
WHERE e.id = s.id
  AND NOT EXISTS (SELECT 1 FROM exercises o WHERE o.slug = s.slug);

INSERT INTO exercises (name, category, status, slug, equipment, load_mode, is_compound, body_region) VALUES
  ('Incline Treadmill Walk', 'Cardio', 'YES', 'incline-treadmill-walk', 'treadmill',  'TIME', FALSE, 'lower'),
  ('Treadmill Run',          'Cardio', 'YES', 'treadmill-run',          'treadmill',  'TIME', FALSE, 'lower'),
  ('Stationary Bike',        'Cardio', 'YES', 'stationary-bike',        'bike',       'TIME', FALSE, 'lower'),
  ('Rowing Machine',         'Cardio', 'YES', 'rowing-machine',         'rower',      'TIME', FALSE, 'lower'),
  ('Stair Climber',          'Cardio', 'YES', 'stair-climber',          'stair',      'TIME', FALSE, 'lower'),
  ('Elliptical',             'Cardio', 'YES', 'elliptical',             'elliptical', 'TIME', FALSE, 'lower'),
  ('Outdoor Walk',           'Cardio', 'YES', 'outdoor-walk',           'none',       'TIME', FALSE, 'lower')
ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING;

-- Lumbar: no loaded spinal hinging in ANY session, not just Session A.
UPDATE constraints
SET rule = 'Logged 19/08, DB RDL brought on pain 21/09. No loaded spinal hinging in any session (A, B or C) until symptom-free. Radiating pain below the knee, numbness or foot weakness = physio first.',
    blocked_patterns = ARRAY['deadlift', 'rdl', 'good morning', 'bent over row', 'pendlay row', 'back extension', 'hyperextension']
WHERE region = 'Lower back · lumbar irritation';

UPDATE coach_flags
SET text = 'Back: no loaded spinal hinging in any session until symptom-free (deadlifts of every kind, RDL, good morning, bent-over or Pendlay row, back extension). Leg curl goes first, calibrate hip thrust / glute bridge.',
    scope = 'global',
    scope_value = NULL
WHERE text LIKE 'Back: no loaded spinal hinging in Session A%'
  AND resolved_at IS NULL;
