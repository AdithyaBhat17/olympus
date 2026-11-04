-- Olympus: foods found on the web, cached. Idempotent, additive.
--
-- When the database has no match (a packaged product, a restaurant dish), the
-- describe flow looks the nutrition label up on the web. The result is saved
-- as the athlete's own food (user_id set, verified = false) so the next log
-- is an instant database hit. source_url is the page the numbers came from.

ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_source_check;
ALTER TABLE foods ADD CONSTRAINT foods_source_check
  CHECK (source IN ('user', 'recipe', 'indb', 'usda_foundation', 'usda_sr', 'usda_fndds', 'off', 'web'));

ALTER TABLE foods ADD COLUMN IF NOT EXISTS source_url TEXT;

-- One cached lookup per athlete per normalised query.
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_web_cache
  ON foods (user_id, source_id) WHERE source = 'web' AND source_id IS NOT NULL;
