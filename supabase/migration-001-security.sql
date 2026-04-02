-- Migration 001: Security fixes
-- Run this against an existing Olympus database

-- Add created_by column for per-user custom exercise isolation
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Unique constraints to prevent duplicate exercises
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_global_unique ON exercises(name, category) WHERE created_by IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_user_unique ON exercises(name, category, created_by) WHERE created_by IS NOT NULL;
