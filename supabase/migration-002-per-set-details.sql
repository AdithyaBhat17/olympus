-- Migration 002: Per-set reps/weight support
-- Adds a JSONB column that holds an array of { reps, weight } objects — one
-- per set. Existing rows keep their aggregate sets/reps/weight values; the
-- app treats NULL set_details as "all sets were the same reps/weight".

ALTER TABLE session_exercises
  ADD COLUMN IF NOT EXISTS set_details JSONB;
