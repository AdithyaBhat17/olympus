-- Olympus: what the iOS app needs. Idempotent.
-- Run BEFORE deploying the code that writes these: the new code inserts the
-- check-in columns on every check-in; the old code never reads any of them.

-- HRV and resting heart rate on daily check-ins. hrv_ms is whatever the
-- source measures: Apple Health stores SDNN, Whoop stores RMSSD. They aren't
-- interchangeable, so sources.hrv says which one a day holds.
ALTER TABLE daily_check_ins
  ADD COLUMN IF NOT EXISTS hrv_ms INTEGER CHECK (hrv_ms BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS resting_hr INTEGER CHECK (resting_hr BETWEEN 20 AND 200);

-- The athlete's name from their Google sign-in. The web reads it from the
-- session cookie; the app has only its OAuth token, so it's kept here.
ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT CHECK (char_length(display_name) <= 100);
