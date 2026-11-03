-- Olympus: describe-food quality tracking. Idempotent, additive.
--
-- One row per "describe what you ate" attempt, logged or not. The draft is
-- what the model and the food search proposed; `final` is what was actually
-- saved. The difference (no match, swapped food, corrected grams, removed,
-- added) is the quality signal reviewed each week (scripts/food/parse-report.ts).

CREATE TABLE IF NOT EXISTS food_parse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- What was typed.
  text TEXT NOT NULL,
  -- web | ios
  client TEXT,
  model TEXT,
  latency_ms INTEGER,
  cost_usd NUMERIC(8, 5),
  -- Set when the model call failed; the draft is then empty.
  error TEXT,
  -- [{ said, search, quantity, unit, estGrams, grams, basis, confidence,
  --    matchId, matchName, matchSource, alternativeIds }]
  draft JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Filled when the draft is logged. Null = abandoned.
  food_log_id UUID REFERENCES food_logs (id) ON DELETE SET NULL,
  logged_at TIMESTAMPTZ,
  -- [{ foodId, name, grams }]
  final JSONB,
  -- Draft items the database had no food for.
  unmatched SMALLINT NOT NULL DEFAULT 0,
  -- Outcome counts, null until logged.
  kept SMALLINT,
  regrammed SMALLINT,
  swapped SMALLINT,
  removed SMALLINT,
  added SMALLINT
);
CREATE INDEX IF NOT EXISTS idx_food_parse_events_user ON food_parse_events (user_id, created_at DESC);
