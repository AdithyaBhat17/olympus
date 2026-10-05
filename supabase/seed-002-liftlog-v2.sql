-- LiftLog v2 seed: constraints, load modes, carriage values, and the machines
-- the current programme actually uses. Run after migration-003. Idempotent.

-- Constraints (the owner's injuries; see migration-006) ---------------------------
INSERT INTO constraints (user_id, region, rule, blocked_patterns) VALUES
  ('evilpotato345@gmail.com', 'Left wrist · TFCC', 'No loaded supination or pronation on a fixed straight bar',
    ARRAY['straight-bar curl', 'barbell curl', 'reverse barbell curl', 'straight-bar pushdown',
          'reverse-grip pushdown', 'fixed straight-bar preacher', 'barbell shrug',
          'flat-palm push-up']),
  ('evilpotato345@gmail.com', 'Shoulder · impingement', 'No barbell overhead or behind-the-neck pressing',
    ARRAY['barbell OHP', 'behind-the-neck press']),
  ('evilpotato345@gmail.com', 'Right knee', 'Machine squat to the depth stop only, knees tracking the 2nd–3rd toe',
    ARRAY[]::TEXT[])
ON CONFLICT (user_id, region) WHERE user_id IS NOT NULL DO UPDATE
  SET rule = EXCLUDED.rule, blocked_patterns = EXCLUDED.blocked_patterns;

-- Exercises the redesign programmes (slugs are what Claude passes as exerciseId) ---
INSERT INTO exercises (name, category, status, slug, equipment, load_mode, carriage_kg_per_side, is_compound, body_region, form_cue_id) VALUES
  ('Assisted Pull-Up',                'Upper Body — Pull (Vertical)',   'YES', 'assisted-pullup',        'machine',     'COUNTERWEIGHT', NULL, TRUE,  'upper', NULL),
  ('Barbell Deadlift',                'Lower Body — Posterior Chain',   'YES', 'barbell-deadlift',       'barbell',     'TOTAL',         NULL, TRUE,  'lower', 'deadlift'),
  ('Lat Pulldown (wide)',             'Upper Body — Pull (Vertical)',   'YES', 'lat-pulldown-wide',      'cable',       'TOTAL',         NULL, TRUE,  'upper', NULL),
  ('Seated Cable Row',                'Upper Body — Pull (Horizontal)', 'YES', 'seated-cable-row',       'cable',       'TOTAL',         NULL, TRUE,  'upper', NULL),
  ('Preacher Curl (rotating handles)','Arms',                           'YES', 'preacher-curl-rotating', 'machine',     'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Machine Shrugs',                  'Upper Body — Pull (Horizontal)', 'YES', 'machine-shrugs',         'machine',     'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Cable Curl (rope)',               'Arms',                           'YES', 'cable-curl-rope',        'cable',       'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Hammer Curl (DB)',                'Arms',                           'YES', 'hammer-curl-db',         'dumbbell',    'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Rope Hammer Curl (cable)',        'Arms',                           'YES', 'rope-hammer-curl',       'cable',       'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Reverse Barbell Curl',            'Arms',                           'NO',  'reverse-barbell-curl',   'barbell',     'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Barbell Curl (straight bar)',     'Arms',                           'NO',  'barbell-curl-straight',  'barbell',     'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Preacher Curl (fixed straight bar)','Arms',                         'NO',  'preacher-curl-fixed',    'machine',     'TOTAL',         NULL, FALSE, 'upper', NULL),
  ('Rope Pushdown',                   'Arms',                           'YES', 'rope-pushdown',          'cable',       'TOTAL',         NULL, FALSE, 'upper', 'pushdown'),
  ('Machine Squat',                   'Lower Body — Quad Dominant',     'YES', 'machine-squat',          'machine',     'TOTAL',         NULL, TRUE,  'lower', 'squat'),
  ('Machine Shoulder Press',          'Upper Body — Push (Vertical)',   'YES', 'machine-shoulder-press', 'machine',     'TOTAL',         NULL, TRUE,  'upper', NULL),
  ('Iso-Lateral Horizontal Press',    'Upper Body — Push (Horizontal)', 'YES', 'iso-horizontal-press',   'iso_lateral', 'PER_SIDE',      8.2,  TRUE,  'upper', NULL),
  ('Iso-Lateral Decline Press',       'Upper Body — Push (Horizontal)', 'YES', 'iso-decline-press',      'iso_lateral', 'PER_SIDE',      2.7,  TRUE,  'upper', NULL),
  ('Iso-Lateral Incline Press',       'Upper Body — Push (Horizontal)', 'YES', 'iso-incline-press',      'iso_lateral', 'PER_SIDE',      3.6,  TRUE,  'upper', NULL)
ON CONFLICT DO NOTHING;

UPDATE exercises SET blocked_reason = 'Loaded pronation on a straight bar. Left wrist.'
  WHERE slug = 'reverse-barbell-curl';
UPDATE exercises SET blocked_reason = 'Forced supination. Left wrist.'
  WHERE slug = 'barbell-curl-straight';
UPDATE exercises SET blocked_reason = 'Fixed grip angle. Left wrist.'
  WHERE slug = 'preacher-curl-fixed';

-- Substitutes for the blocked curls
UPDATE exercises SET substitute_ids = ARRAY(SELECT id FROM exercises WHERE slug = 'hammer-curl-db')
  WHERE slug IN ('barbell-curl-straight', 'reverse-barbell-curl');
UPDATE exercises SET substitute_ids = ARRAY(SELECT id FROM exercises WHERE slug = 'preacher-curl-rotating')
  WHERE slug = 'preacher-curl-fixed';

-- Classify the original library: compounds + regions for the increment rules ----
UPDATE exercises SET body_region = 'lower'
  WHERE body_region IS NULL AND category IN ('Lower Body — Quad Dominant', 'Lower Body — Posterior Chain', 'Calves');
UPDATE exercises SET body_region = 'upper' WHERE body_region IS NULL;
UPDATE exercises SET is_compound = TRUE
  WHERE slug IS NULL AND name IN (
    'Barbell Back Squat', 'Barbell Front Squat', 'Hack Squat (machine)', 'Leg Press',
    'Conventional Deadlift', 'Romanian Deadlift', 'Barbell Bench Press', 'Dumbbell Bench Press',
    'Incline Barbell Press', 'Incline Dumbbell Press', 'Decline Press', 'Machine Chest Press',
    'Barbell OHP', 'Dumbbell OHP', 'Seated Machine Press', 'Barbell Bent Over Row', 'Dumbbell Row',
    'Cable Row (seated)', 'Machine Row', 'Chest Supported Row', 'Lat Pulldown (bar)',
    'Lat Pulldown (neutral)', 'Weighted Pull Up', 'Close Grip Bench Press');
UPDATE exercises SET form_cue_id = 'deadlift' WHERE name = 'Conventional Deadlift' AND form_cue_id IS NULL;
UPDATE exercises SET form_cue_id = 'pushdown' WHERE name = 'Tricep Pushdown (cable)' AND form_cue_id IS NULL;
