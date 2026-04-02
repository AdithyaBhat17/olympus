-- Olympus — Gym Session Logger
-- Run this in the Neon SQL Editor to set up the database

-- Exercise categories enum
CREATE TYPE exercise_category AS ENUM (
  'Lower Body — Quad Dominant',
  'Lower Body — Posterior Chain',
  'Upper Body — Push (Horizontal)',
  'Upper Body — Push (Vertical)',
  'Upper Body — Pull (Horizontal)',
  'Upper Body — Pull (Vertical)',
  'Arms',
  'Core',
  'Calves'
);

-- Exercise status enum
CREATE TYPE exercise_status AS ENUM ('YES', 'SUB', 'NO');

-- Exercises table
CREATE TABLE exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category exercise_category NOT NULL,
  status exercise_status NOT NULL DEFAULT 'YES',
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Sessions table
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  session_name TEXT NOT NULL,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 12),
  block_number TEXT NOT NULL CHECK (block_number IN ('1', '2', '3', 'Deload')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Session exercises table
CREATE TABLE session_exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES exercises(id) NOT NULL,
  sets INTEGER NOT NULL CHECK (sets > 0),
  reps INTEGER NOT NULL CHECK (reps > 0),
  weight NUMERIC(6,2) NOT NULL CHECK (weight >= 0),
  rpe NUMERIC(3,1) CHECK (rpe BETWEEN 5 AND 10),
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_date ON sessions(date DESC);
CREATE INDEX idx_sessions_session_name ON sessions(session_name);
CREATE INDEX idx_session_exercises_session_id ON session_exercises(session_id);
CREATE INDEX idx_session_exercises_exercise_id ON session_exercises(exercise_id);
CREATE INDEX idx_exercises_category ON exercises(category);
