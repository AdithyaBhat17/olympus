-- Olympus: supplements, medication timing, labs (Phase 2b). Idempotent, additive.
--
-- Informational only: the timing rules and lab checklists are reminders with
-- sources, never medical advice. Missed days are data, not failures: there
-- are no streaks.

-- 1. The stack.
CREATE TABLE IF NOT EXISTS supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  brand TEXT,
  form TEXT NOT NULL DEFAULT 'tablet' CHECK (form IN ('tablet', 'capsule', 'softgel', 'powder', 'liquid', 'gummy', 'other')),
  -- "1 tablet", "1 scoop (31 g)".
  serving_desc TEXT NOT NULL DEFAULT '1 serving',
  -- Servings taken per dose: magnesium glycinate is 2 tablets.
  servings_per_dose NUMERIC(5, 2) NOT NULL DEFAULT 1 CHECK (servings_per_dose > 0),
  servings_per_container NUMERIC(7, 1) CHECK (servings_per_container > 0),
  slot TEXT NOT NULL CHECK (slot IN ('waking', 'breakfast', 'lunch', 'dinner', 'pre_workout', 'post_workout', 'bedtime', 'any')),
  -- 0 = Sunday … 6 = Saturday. Empty = every day.
  active_days SMALLINT[] NOT NULL DEFAULT '{}',
  -- levothyroxine, calcium, iron, magnesium, multivitamin, biotin, soy, protein, collagen, vitamin_d, selenium, creatine
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- Lab markers it relates to: TSH, FT4, 25OHD, MG, FERRITIN …
  markers TEXT[] NOT NULL DEFAULT '{}',
  -- Whey, collagen: a dose also logs this food (grams per serving below).
  food_id UUID REFERENCES foods (id),
  food_grams_per_serving NUMERIC(6, 1) CHECK (food_grams_per_serving > 0),
  -- [{ "region": "UAE", "note": "Amazon.ae" }, { "region": "India", "note": "…" }]
  where_to_buy JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  position SMALLINT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplements_user ON supplements (user_id) WHERE archived_at IS NULL;

-- Per-serving amounts from the label.
CREATE TABLE IF NOT EXISTS supplement_ingredients (
  supplement_id UUID NOT NULL REFERENCES supplements (id) ON DELETE CASCADE,
  nutrient TEXT NOT NULL,
  amount NUMERIC(10, 3) NOT NULL CHECK (amount >= 0),
  unit TEXT NOT NULL CHECK (unit IN ('mcg', 'mg', 'g', 'IU', 'kcal', '%')),
  PRIMARY KEY (supplement_id, nutrient)
);

-- 2. What was taken. One row per supplement per day per slot.
CREATE TABLE IF NOT EXISTS supplement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  supplement_id UUID NOT NULL REFERENCES supplements (id) ON DELETE CASCADE,
  taken_at TIMESTAMPTZ NOT NULL,
  tz TEXT NOT NULL,
  local_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('taken', 'half', 'skipped')),
  -- Doses taken: 1, 0.5, 0, or 2 for a double scoop.
  dose_multiplier NUMERIC(4, 2) NOT NULL CHECK (dose_multiplier >= 0),
  late BOOLEAN NOT NULL DEFAULT false,
  -- The food log entry a whey/collagen dose created.
  food_log_id UUID REFERENCES food_logs (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, supplement_id, local_date)
);
CREATE INDEX IF NOT EXISTS idx_supplement_logs_user_date ON supplement_logs (user_id, local_date);

-- 3. Restocks. Servings left = restocked − taken since.
CREATE TABLE IF NOT EXISTS supplement_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  supplement_id UUID NOT NULL REFERENCES supplements (id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  servings NUMERIC(7, 1) NOT NULL,
  -- 'restock' adds a container; 'count' sets what's actually left.
  kind TEXT NOT NULL CHECK (kind IN ('restock', 'count')),
  region TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_supplement_inventory ON supplement_inventory (supplement_id, at);

-- 4. Timing rules: config, not code. A NULL user_id row is a default for
--    everyone; a user's own row with the same key overrides it.
CREATE TABLE IF NOT EXISTS timing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  key TEXT NOT NULL,
  -- Tags: supplement tags, food tags (coffee, soy, calcium_rich, iron_rich,
  -- high_fibre) and "food" for any meal.
  subject_tag TEXT NOT NULL,
  object_tag TEXT NOT NULL,
  min_gap_min INTEGER NOT NULL CHECK (min_gap_min > 0),
  -- 'after': the object should come at least min_gap after the subject.
  -- 'either': keep them at least min_gap apart in either order.
  direction TEXT NOT NULL CHECK (direction IN ('after', 'either')),
  message TEXT NOT NULL,
  citation TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_timing_rules_key ON timing_rules (coalesce(user_id, ''), key);

INSERT INTO timing_rules (user_id, key, subject_tag, object_tag, min_gap_min, direction, message, citation) VALUES
  (NULL, 'levo-food', 'levothyroxine', 'food', 30, 'after',
   'Levothyroxine is best absorbed on an empty stomach; food within 30–60 minutes can lower absorption.',
   'Jonklaas J et al. Guidelines for the treatment of hypothyroidism (American Thyroid Association). Thyroid 2014;24(12):1670–1751.'),
  (NULL, 'levo-coffee', 'levothyroxine', 'coffee', 60, 'after',
   'Coffee soon after levothyroxine can reduce how much is absorbed. Waiting about an hour avoids it.',
   'Benvenga S et al. Altered intestinal absorption of L-thyroxine caused by coffee. Thyroid 2008;18(3):293–301.'),
  (NULL, 'levo-calcium', 'levothyroxine', 'calcium', 240, 'either',
   'Calcium can bind levothyroxine in the gut. Keeping them about 4 hours apart avoids it.',
   'Singh N, Singh PN, Hershman JM. Effect of calcium carbonate on the absorption of levothyroxine. JAMA 2000;283(21):2822–2825.'),
  (NULL, 'levo-calcium-food', 'levothyroxine', 'calcium_rich', 240, 'either',
   'Calcium-rich foods (milk, curd, paneer) can lower levothyroxine absorption when close together.',
   'Jonklaas J et al. Thyroid 2014;24(12):1670–1751 (separate from calcium-containing products).'),
  (NULL, 'levo-iron', 'levothyroxine', 'iron', 240, 'either',
   'Iron binds levothyroxine. Keeping them about 4 hours apart avoids it.',
   'Campbell NR et al. Ferrous sulfate reduces thyroxine efficacy in patients with hypothyroidism. Ann Intern Med 1992;117(12):1010–1013.'),
  (NULL, 'levo-magnesium', 'levothyroxine', 'magnesium', 240, 'either',
   'Magnesium-containing products are usually kept about 4 hours from levothyroxine.',
   'Jonklaas J et al. Thyroid 2014;24(12):1670–1751 (separate from mineral- and antacid-containing products).'),
  (NULL, 'levo-multivitamin', 'levothyroxine', 'multivitamin', 240, 'either',
   'Multivitamins usually contain minerals (iron, calcium, zinc) that bind levothyroxine. About 4 hours apart avoids it.',
   'Jonklaas J et al. Thyroid 2014;24(12):1670–1751.'),
  (NULL, 'levo-soy', 'levothyroxine', 'soy', 240, 'either',
   'Soy can reduce levothyroxine absorption. Keeping them a few hours apart avoids it.',
   'Bell DS, Ovalle F. Use of soy protein supplement and resultant need for increased dose of levothyroxine. Endocr Pract 2001;7(3):193–194.'),
  (NULL, 'levo-fibre', 'levothyroxine', 'high_fibre', 120, 'either',
   'A lot of fibre close to levothyroxine can lower absorption. Consistency matters more than avoiding fibre.',
   'Liel Y et al. Evidence for a clinically important adverse effect of fiber-enriched diet on the bioavailability of levothyroxine. J Clin Endocrinol Metab 1996;81(2):857–859.')
ON CONFLICT DO NOTHING;

-- 5. Labs.
CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  drawn_on DATE NOT NULL,
  marker TEXT NOT NULL,
  value NUMERIC(10, 3) NOT NULL,
  unit TEXT NOT NULL,
  ref_low NUMERIC(10, 3),
  ref_high NUMERIC(10, 3),
  lab TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, drawn_on, marker)
);
CREATE INDEX IF NOT EXISTS idx_lab_results_user_marker ON lab_results (user_id, marker, drawn_on);

CREATE TABLE IF NOT EXISTS lab_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  tz TEXT NOT NULL,
  markers TEXT[] NOT NULL DEFAULT '{}',
  fasting BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  -- Doctor's instruction for the thyroid dose on test day, as given.
  thyroid_med_instruction TEXT,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_appointments_user ON lab_appointments (user_id, scheduled_at);
