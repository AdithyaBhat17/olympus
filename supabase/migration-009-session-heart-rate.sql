-- Olympus: heart rate per session, from Apple Health. Idempotent.
-- Run BEFORE deploying the code that writes it.

-- Average / max HR and minutes covered over the session's started→finished
-- window, from the one device that recorded most of it. Only Claude reads it
-- (get_sessions). See SessionHeartRate in src/lib/db/schema.ts for the shape.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS heart_rate JSONB;
