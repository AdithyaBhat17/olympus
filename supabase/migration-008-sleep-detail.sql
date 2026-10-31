-- Olympus: how a night went, not just how long it was. Idempotent.
-- Run BEFORE deploying the code that writes it.

-- Stage minutes (deep / REM / light / awake), awakenings, bedtime and wake
-- time, from whichever device the sleep source picked for that night. Only
-- Claude reads it (get_recovery); the app still shows sleep_min. See
-- SleepDetail in src/lib/db/schema.ts for the shape.
ALTER TABLE daily_check_ins
  ADD COLUMN IF NOT EXISTS sleep_detail JSONB;
