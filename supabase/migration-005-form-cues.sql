-- Olympus v3 "Chalk & Ember": 3D form cue for the wide-grip lat pulldown.
-- Idempotent; only fills rows that have no cue yet.
UPDATE exercises SET form_cue_id = 'lat-pulldown'
WHERE slug = 'lat-pulldown-wide' AND form_cue_id IS NULL;
