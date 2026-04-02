-- Olympus Exercise Library Seed Data
-- Run this after schema.sql (idempotent — safe to re-run)

-- Lower Body — Quad Dominant
INSERT INTO exercises (name, category, status) VALUES
  ('Barbell Back Squat', 'Lower Body — Quad Dominant', 'YES'),
  ('Barbell Front Squat', 'Lower Body — Quad Dominant', 'SUB'),
  ('Safety Bar Squat', 'Lower Body — Quad Dominant', 'NO'),
  ('Hack Squat (machine)', 'Lower Body — Quad Dominant', 'YES'),
  ('Leg Press', 'Lower Body — Quad Dominant', 'YES'),
  ('Bulgarian Split Squat', 'Lower Body — Quad Dominant', 'YES'),
  ('Lunges (walking, barbell/DB)', 'Lower Body — Quad Dominant', 'YES'),
  ('Step Ups', 'Lower Body — Quad Dominant', 'NO'),
  ('Goblet Squat', 'Lower Body — Quad Dominant', 'SUB'),
  ('Leg Extension (machine)', 'Lower Body — Quad Dominant', 'YES')
ON CONFLICT DO NOTHING;

-- Lower Body — Posterior Chain
INSERT INTO exercises (name, category, status) VALUES
  ('Conventional Deadlift', 'Lower Body — Posterior Chain', 'YES'),
  ('Sumo Deadlift', 'Lower Body — Posterior Chain', 'NO'),
  ('Romanian Deadlift', 'Lower Body — Posterior Chain', 'YES'),
  ('Stiff Leg Deadlift', 'Lower Body — Posterior Chain', 'NO'),
  ('Hip Thrust (barbell)', 'Lower Body — Posterior Chain', 'SUB'),
  ('Hip Thrust (machine)', 'Lower Body — Posterior Chain', 'NO'),
  ('Glute Bridge', 'Lower Body — Posterior Chain', 'SUB'),
  ('Leg Curl (lying)', 'Lower Body — Posterior Chain', 'YES'),
  ('Leg Curl (seated)', 'Lower Body — Posterior Chain', 'NO'),
  ('Nordic Curl', 'Lower Body — Posterior Chain', 'SUB'),
  ('Good Morning', 'Lower Body — Posterior Chain', 'SUB'),
  ('Cable Pull Through', 'Lower Body — Posterior Chain', 'NO')
ON CONFLICT DO NOTHING;

-- Upper Body — Push (Horizontal)
INSERT INTO exercises (name, category, status) VALUES
  ('Barbell Bench Press', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Dumbbell Bench Press', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Incline Barbell Press', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Incline Dumbbell Press', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Decline Press', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Machine Chest Press', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Cable Fly', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Dumbbell Fly', 'Upper Body — Push (Horizontal)', 'YES'),
  ('Pec Dec (machine)', 'Upper Body — Push (Horizontal)', 'SUB')
ON CONFLICT DO NOTHING;

-- Upper Body — Push (Vertical)
INSERT INTO exercises (name, category, status) VALUES
  ('Barbell OHP', 'Upper Body — Push (Vertical)', 'YES'),
  ('Dumbbell OHP', 'Upper Body — Push (Vertical)', 'YES'),
  ('Arnold Press', 'Upper Body — Push (Vertical)', 'YES'),
  ('Seated Machine Press', 'Upper Body — Push (Vertical)', 'SUB'),
  ('Landmine Press', 'Upper Body — Push (Vertical)', 'SUB'),
  ('Lateral Raise (DB)', 'Upper Body — Push (Vertical)', 'YES'),
  ('Lateral Raise (cable)', 'Upper Body — Push (Vertical)', 'YES'),
  ('Rear Delt Fly (DB)', 'Upper Body — Push (Vertical)', 'NO'),
  ('Rear Delt Fly (machine)', 'Upper Body — Push (Vertical)', 'YES'),
  ('Face Pull (cable)', 'Upper Body — Push (Vertical)', 'YES')
ON CONFLICT DO NOTHING;

-- Upper Body — Pull (Horizontal)
INSERT INTO exercises (name, category, status) VALUES
  ('Barbell Bent Over Row', 'Upper Body — Pull (Horizontal)', 'YES'),
  ('Dumbbell Row', 'Upper Body — Pull (Horizontal)', 'YES'),
  ('Cable Row (seated)', 'Upper Body — Pull (Horizontal)', 'YES'),
  ('Machine Row', 'Upper Body — Pull (Horizontal)', 'YES'),
  ('Chest Supported Row', 'Upper Body — Pull (Horizontal)', 'YES'),
  ('Meadows Row', 'Upper Body — Pull (Horizontal)', 'NO'),
  ('Pendlay Row', 'Upper Body — Pull (Horizontal)', 'NO')
ON CONFLICT DO NOTHING;

-- Upper Body — Pull (Vertical)
INSERT INTO exercises (name, category, status) VALUES
  ('Pull Up (bodyweight)', 'Upper Body — Pull (Vertical)', 'NO'),
  ('Weighted Pull Up', 'Upper Body — Pull (Vertical)', 'SUB'),
  ('Chin Up', 'Upper Body — Pull (Vertical)', 'NO'),
  ('Lat Pulldown (bar)', 'Upper Body — Pull (Vertical)', 'YES'),
  ('Lat Pulldown (neutral)', 'Upper Body — Pull (Vertical)', 'SUB'),
  ('Single Arm Pulldown', 'Upper Body — Pull (Vertical)', 'NO'),
  ('Straight Arm Pulldown', 'Upper Body — Pull (Vertical)', 'NO')
ON CONFLICT DO NOTHING;

-- Arms
INSERT INTO exercises (name, category, status) VALUES
  ('Barbell Curl', 'Arms', 'YES'),
  ('Dumbbell Curl', 'Arms', 'YES'),
  ('Incline Dumbbell Curl', 'Arms', 'YES'),
  ('Cable Curl', 'Arms', 'YES'),
  ('Hammer Curl', 'Arms', 'YES'),
  ('Preacher Curl (machine)', 'Arms', 'YES'),
  ('Close Grip Bench Press', 'Arms', 'YES'),
  ('Tricep Pushdown (cable)', 'Arms', 'YES'),
  ('Overhead Tricep Ext (cable)', 'Arms', 'YES'),
  ('Skull Crushers', 'Arms', 'YES'),
  ('Dips (tricep)', 'Arms', 'YES')
ON CONFLICT DO NOTHING;

-- Core
INSERT INTO exercises (name, category, status) VALUES
  ('Plank', 'Core', 'YES'),
  ('Cable Crunch', 'Core', 'NO'),
  ('Hanging Leg Raise', 'Core', 'YES'),
  ('Ab Wheel', 'Core', 'NO'),
  ('Pallof Press', 'Core', 'NO'),
  ('Landmine Rotation', 'Core', 'SUB')
ON CONFLICT DO NOTHING;

-- Calves
INSERT INTO exercises (name, category, status) VALUES
  ('Standing Calf Raise', 'Calves', 'YES'),
  ('Seated Calf Raise', 'Calves', 'YES'),
  ('Leg Press Calf Raise', 'Calves', 'YES')
ON CONFLICT DO NOTHING;
