-- Migration 003: LiftLog v2 — plans from Claude, true-load maths, recovery
-- check-ins, coach flags, constraints, MCP OAuth + audit, web push, and
-- Whoop / Apple Health integrations. Idempotent: safe to re-run.

-- Exercises: load model + constraints metadata --------------------------------
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS equipment TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS load_mode TEXT NOT NULL DEFAULT 'TOTAL'
  CHECK (load_mode IN ('TOTAL', 'PER_SIDE', 'COUNTERWEIGHT'));
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS carriage_kg_per_side NUMERIC(5,2);
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS substitute_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_compound BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS body_region TEXT CHECK (body_region IN ('upper', 'lower'));
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS form_cue_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_slug ON exercises(slug) WHERE slug IS NOT NULL;

-- Plans -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  session_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('claude', 'manual')),
  client_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY'
    CHECK (status IN ('DRAFT', 'READY', 'IN_PROGRESS', 'DONE', 'SKIPPED')),
  coach_notes TEXT,
  recovery_gate JSONB,
  warnings JSONB NOT NULL DEFAULT '[]',
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_user_client_ref ON plans(user_id, client_ref);
CREATE INDEX IF NOT EXISTS idx_plans_user_date ON plans(user_id, date);

CREATE TABLE IF NOT EXISTS plan_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  order_index INTEGER NOT NULL,
  pair_group TEXT,
  rest_sec INTEGER NOT NULL DEFAULT 120,
  straps BOOLEAN NOT NULL DEFAULT FALSE,
  cues TEXT[] NOT NULL DEFAULT '{}',
  sets JSONB NOT NULL,
  override_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON plan_items(plan_id);

-- Sessions: live state + link to the plan they came from -----------------------
ALTER TABLE sessions ALTER COLUMN week_number SET DEFAULT 1;
ALTER TABLE sessions ALTER COLUMN block_number SET DEFAULT '1';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DONE'
  CHECK (status IN ('IN_PROGRESS', 'DONE'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS swaps JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);

-- Per-set rows now carry { reps, weight (true kg), platesKg, rpe, type, flags, doneAt }
-- inside set_details; plan_item_id ties them back to the plan.
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS plan_item_id UUID;
-- Live sessions save an exercise row as soon as its first set is done.
ALTER TABLE session_exercises DROP CONSTRAINT IF EXISTS session_exercises_rpe_check;
ALTER TABLE session_exercises ADD CONSTRAINT session_exercises_rpe_check CHECK (rpe BETWEEN 1 AND 10);

-- Recovery check-ins ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_check_ins (
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  sleep_min INTEGER CHECK (sleep_min BETWEEN 0 AND 1440),
  protein_g INTEGER CHECK (protein_g BETWEEN 0 AND 1000),
  water_ml INTEGER CHECK (water_ml BETWEEN 0 AND 20000),
  sources JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- Coach flags, constraints, audited working-weight overrides ------------------
CREATE TABLE IF NOT EXISTS coach_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'sessionType', 'exerciseId')),
  scope_value TEXT,
  created_by TEXT NOT NULL CHECK (created_by IN ('claude', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_coach_flags_user ON coach_flags(user_id);

CREATE TABLE IF NOT EXISTS constraints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT, -- NULL rows are legacy and ignored (migration-006)
  region TEXT NOT NULL,
  rule TEXT NOT NULL,
  blocked_patterns TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_constraints_global_region ON constraints(region) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_constraints_user_region ON constraints(user_id, region) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS working_weight_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  kg NUMERIC(6,2) NOT NULL,
  previous_kg NUMERIC(6,2),
  reason TEXT NOT NULL,
  forced BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL CHECK (created_by IN ('claude', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MCP audit log + OAuth 2.1 state -------------------------------------------------
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('read', 'write')),
  ok BOOLEAN NOT NULL,
  summary TEXT,
  input JSONB,
  client_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_user_time ON mcp_audit_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT,
  resource TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);

-- Web push + integrations ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('whoop', 'apple_health')),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  ingest_token_hash TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_ingest_token ON integrations(ingest_token_hash);
