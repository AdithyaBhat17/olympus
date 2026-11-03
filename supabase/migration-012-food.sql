-- Olympus: food logging (Phase 2). Idempotent and additive.
--
-- Nutrients always come from a food database row, never from a model's
-- guess; every row records where its numbers came from (source + source_id).
-- Logged items snapshot their nutrients, so editing or re-importing a food
-- never rewrites history.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Foods: the athlete's own foods and recipes, INDB, USDA, Open Food
--    Facts, and MyFitnessPal history. Values are per 100 g.
CREATE TABLE IF NOT EXISTS foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL for shared database rows; set for the athlete's own foods and recipes.
  user_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('user', 'recipe', 'indb', 'usda_foundation', 'usda_sr', 'off')),
  -- fdcId, INDB food code, barcode. NULL for the athlete's own foods.
  source_id TEXT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  brand TEXT,
  barcode TEXT,
  category TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  -- name + brand + aliases, lower-cased, maintained by the app; what search reads.
  search_text TEXT NOT NULL,
  search_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  kcal_100g NUMERIC(7, 2) NOT NULL CHECK (kcal_100g >= 0 AND kcal_100g <= 950),
  protein_100g NUMERIC(6, 2) CHECK (protein_100g BETWEEN 0 AND 100),
  carbs_100g NUMERIC(6, 2) CHECK (carbs_100g BETWEEN 0 AND 100),
  fat_100g NUMERIC(6, 2) CHECK (fat_100g BETWEEN 0 AND 100),
  fibre_100g NUMERIC(6, 2) CHECK (fibre_100g BETWEEN 0 AND 100),
  sugar_100g NUMERIC(6, 2) CHECK (sugar_100g BETWEEN 0 AND 100),
  sodium_mg_100g NUMERIC(8, 2) CHECK (sodium_mg_100g >= 0),
  -- Other nutrients per 100 g: { "calcium_mg": 120, "iron_mg": 2.1, ... }
  micros JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- For timing rules: coffee, soy, calcium_rich, high_fibre, iron_rich, ...
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- The household serving the source suggests (INDB serving, OFF serving size).
  serving_g NUMERIC(7, 1) CHECK (serving_g > 0),
  serving_label TEXT,
  -- Recipes: cooked weight of the whole pot, which the per-100 g values divide by.
  recipe_yield_g NUMERIC(8, 1) CHECK (recipe_yield_g > 0),
  verified BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_source_id
  ON foods (source, source_id) WHERE source_id IS NOT NULL AND user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_foods_user ON foods (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foods_search_trgm ON foods USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_foods_search_tsv ON foods USING gin (search_tsv);

-- 2. Named portions: "1 roti" = 40 g, "1 tbsp" = 13.6 g.
CREATE TABLE IF NOT EXISTS food_portions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  food_id UUID NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  grams NUMERIC(7, 1) NOT NULL CHECK (grams > 0),
  position SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (food_id, label)
);

-- 3. Recipes built from weighed ingredients (the fix for unreliable Indian
--    entries): the recipe is itself a food whose per-100 g values are the
--    ingredients' totals divided by the cooked yield.
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id UUID NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  ingredient_id UUID NOT NULL REFERENCES foods (id),
  grams NUMERIC(7, 1) NOT NULL CHECK (grams > 0),
  PRIMARY KEY (recipe_id, position)
);

-- 4. Logged food. A log is one meal entry; its items carry nutrient
--    snapshots. MyFitnessPal history arrives as meal totals (no food_id).
CREATE TABLE IF NOT EXISTS food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  eaten_at TIMESTAMPTZ NOT NULL,
  tz TEXT NOT NULL,
  local_date DATE NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  input_mode TEXT NOT NULL CHECK (input_mode IN ('search', 'text', 'photo', 'barcode', 'saved', 'recipe', 'supplement', 'mfp_import')),
  raw_text TEXT,
  note TEXT,
  model TEXT,
  cost_usd NUMERIC(8, 5),
  -- Idempotency for imports, e.g. "mfp:2024-06-28:Breakfast".
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_date ON food_logs (user_id, local_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_logs_external_ref
  ON food_logs (user_id, external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS food_log_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id UUID NOT NULL REFERENCES food_logs (id) ON DELETE CASCADE,
  position SMALLINT NOT NULL DEFAULT 0,
  food_id UUID REFERENCES foods (id) ON DELETE SET NULL,
  -- Snapshots, so the entry reads the same whatever happens to the food.
  name TEXT NOT NULL,
  food_source TEXT NOT NULL,
  grams NUMERIC(7, 1) CHECK (grams > 0),
  kcal NUMERIC(7, 1) NOT NULL CHECK (kcal >= 0),
  protein_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  fibre_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (fibre_g >= 0),
  -- Collagen etc.: kcal count, protein shown separately, off the floor.
  counts_to_protein BOOLEAN NOT NULL DEFAULT true,
  -- What the parser or vision model estimated, kept to learn usual portions.
  est_grams NUMERIC(7, 1),
  confidence NUMERIC(3, 2) CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_food_log_items_log ON food_log_items (log_id);
CREATE INDEX IF NOT EXISTS idx_food_log_items_food ON food_log_items (food_id) WHERE food_id IS NOT NULL;

-- 5. Favourites and saved meals.
CREATE TABLE IF NOT EXISTS food_favourites (
  user_id TEXT NOT NULL,
  food_id UUID NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, food_id)
);

CREATE TABLE IF NOT EXISTS saved_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS saved_meal_items (
  meal_id UUID NOT NULL REFERENCES saved_meals (id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  food_id UUID NOT NULL REFERENCES foods (id),
  grams NUMERIC(7, 1) NOT NULL CHECK (grams > 0),
  PRIMARY KEY (meal_id, position)
);

-- 6. Weigh-ins (MyFitnessPal history now; Withings and Apple Health later).
--    A trend input for adaptive TDEE, not the goal.
CREATE TABLE IF NOT EXISTS weigh_ins (
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'mfp', 'apple_health', 'withings', 'garmin')),
  measured_at TIMESTAMPTZ NOT NULL,
  tz TEXT NOT NULL,
  local_date DATE NOT NULL,
  kg NUMERIC(5, 2) CHECK (kg BETWEEN 20 AND 400),
  body_fat_pct NUMERIC(4, 1) CHECK (body_fat_pct BETWEEN 1 AND 75),
  waist_cm NUMERIC(5, 1),
  neck_cm NUMERIC(5, 1),
  hips_cm NUMERIC(5, 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source, measured_at)
);
CREATE INDEX IF NOT EXISTS idx_weigh_ins_user_date ON weigh_ins (user_id, local_date);

-- 7. Collagen protein toward the protein floor: off by default (incomplete
--    amino acid profile, negligible leucine). Its kcal always count.
ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS collagen_counts_to_protein BOOLEAN NOT NULL DEFAULT false;
