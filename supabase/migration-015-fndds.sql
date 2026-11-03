-- Olympus: USDA FNDDS (Survey Foods) as a food source. Idempotent, additive.
--
-- FNDDS describes foods as eaten (guacamole, hummus, burritos, curries),
-- which SR Legacy and Foundation Foods (mostly ingredients) don't cover.
-- Found through food_parse_events: "1tbsp guac" had no match at all.

ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_source_check;
ALTER TABLE foods ADD CONSTRAINT foods_source_check
  CHECK (source IN ('user', 'recipe', 'indb', 'usda_foundation', 'usda_sr', 'usda_fndds', 'off'));
