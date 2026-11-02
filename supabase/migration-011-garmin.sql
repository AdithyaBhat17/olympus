-- Olympus: Garmin Connect Personal API (sleep, HRV, resting HR, stress, Body
-- Battery, activities with 1 Hz heart rate). Idempotent and additive: safe
-- to run before deploying the code that writes it, and the current code
-- ignores everything it adds.
--
-- Field choices come from a discovery run against a real Instinct 2 + Cirqa
-- (docs/companion/garmin-findings.md).

-- 1. Integrations: allow 'garmin', keep its API key encrypted (AES-256-GCM,
--    key in GARMIN_SECRET_KEY, never in the DB), when that key expires, and
--    where incremental sync got to.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN ('whoop', 'apple_health', 'garmin'));
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS secret_enc TEXT;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS key_expires_at TIMESTAMPTZ;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS sync_state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Raw Garmin responses, one row per (endpoint, day) or (endpoint,
--    activity), replaced on re-fetch, so everything can be re-parsed later
--    without calling Garmin again. Range responses are split into their
--    per-day items before storing, which keeps this to a few rows a day.
CREATE TABLE IF NOT EXISTS raw_garmin (
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  -- Calendar date (yyyy-MM-dd) for daily data, activity id for activities.
  resource_key TEXT NOT NULL,
  local_date DATE,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  first_fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint, resource_key)
);
CREATE INDEX IF NOT EXISTS idx_raw_garmin_user_date ON raw_garmin (user_id, local_date);

-- 3. One row per day per device: everything a wearable says about a day,
--    kept per source so baselines never mix devices (Garmin RMSSD vs Apple
--    Health SDNN). daily_check_ins stays the merged view Claude reads.
CREATE TABLE IF NOT EXISTS daily_wearable (
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('garmin', 'whoop', 'apple_health')),
  hrv_ms SMALLINT CHECK (hrv_ms BETWEEN 1 AND 500),
  hrv_method TEXT CHECK (hrv_method IN ('rmssd', 'sdnn')),
  hrv_weekly_avg_ms SMALLINT CHECK (hrv_weekly_avg_ms BETWEEN 1 AND 500),
  hrv_5min_high_ms SMALLINT CHECK (hrv_5min_high_ms BETWEEN 1 AND 500),
  hrv_status TEXT,
  resting_hr SMALLINT CHECK (resting_hr BETWEEN 20 AND 200),
  sleep_min SMALLINT CHECK (sleep_min BETWEEN 0 AND 1440),
  deep_min SMALLINT CHECK (deep_min BETWEEN 0 AND 1440),
  light_min SMALLINT CHECK (light_min BETWEEN 0 AND 1440),
  rem_min SMALLINT CHECK (rem_min BETWEEN 0 AND 1440),
  awake_min SMALLINT CHECK (awake_min BETWEEN 0 AND 1440),
  awakenings SMALLINT CHECK (awakenings >= 0),
  nap_min SMALLINT CHECK (nap_min BETWEEN 0 AND 1440),
  sleep_start TIMESTAMPTZ,
  sleep_end TIMESTAMPTZ,
  -- Local offset for that night (minutes east of UTC): travel shows up here.
  sleep_utc_offset_min SMALLINT CHECK (sleep_utc_offset_min BETWEEN -840 AND 840),
  sleep_hr_avg SMALLINT CHECK (sleep_hr_avg BETWEEN 20 AND 200),
  respiration_avg NUMERIC(4, 1),
  spo2_avg NUMERIC(4, 1),
  sleep_stress_avg SMALLINT,
  -- Garmin's own sleep need: baseline, actual, adjustments, bedtime window.
  sleep_need JSONB,
  stress_avg SMALLINT,
  -- Durations (minutes) by stress band.
  stress JSONB,
  -- min, max, charged, drained, latest.
  body_battery JSONB,
  steps INTEGER CHECK (steps >= 0),
  moderate_min SMALLINT CHECK (moderate_min >= 0),
  vigorous_min SMALLINT CHECK (vigorous_min >= 0),
  active_kcal INTEGER CHECK (active_kcal >= 0),
  jet_lag JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date, source)
);

-- 4. Garmin activities live in the existing external_activities table
--    (source = 'garmin'); this holds Garmin's extras (training effect, load,
--    activity name, local offset).
ALTER TABLE external_activities ADD COLUMN IF NOT EXISTS details JSONB;

-- 5. Per-second detail parsed from the activity FIT file. The FIT itself
--    isn't kept: Garmin serves it again on request.
CREATE TABLE IF NOT EXISTS activity_streams (
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  hr_start TIMESTAMPTZ,
  -- Seconds after hr_start, and the bpm at each: two parallel arrays.
  hr_t INTEGER[] NOT NULL DEFAULT '{}',
  hr_bpm SMALLINT[] NOT NULL DEFAULT '{}',
  laps JSONB NOT NULL DEFAULT '[]'::jsonb,
  strength_sets JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Sport, sub-sport and FIT session totals.
  fit_meta JSONB,
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source, external_id),
  FOREIGN KEY (user_id, source, external_id)
    REFERENCES external_activities (user_id, source, external_id) ON DELETE CASCADE,
  CHECK (cardinality(hr_t) = cardinality(hr_bpm))
);
