# Decisions

Newest first. What was decided, and why.

## 2026-11-04: Food logging redesign and web lookup (migration 016)

- **Finding and checking are two steps.** The log sheet (web and iOS) only finds foods: Search, Describe, Barcode. A sticky "Review N" bar leads to a Review screen with the amounts, meal and time, and the Log button. A describe goes straight to Review. Chosen from three prototypes (one box, tabs sheet, describe first); the tabs sheet was easiest to use.
- **Tap a search row to set the amount,** as in MyFitnessPal: a number and a unit (g, ml, or a portion such as roti). Changing the unit keeps the weight. The + still adds at the usual amount.
- **ml is volume, not weight.** "200 ml milk" was logged as 200 g. Density now comes from the food's own cup, fl oz, tablespoon or teaspoon portion; with none, water's.
- **Foods the database lacks are looked up on the web and cached** (`webLookupFood`). The model reads a label through OpenRouter's web plugin and reports the numbers as printed; we convert to per 100 g and refuse anything that doesn't add up (calories vs 4/4/9 macros, ranges) or whose source URL wasn't in the search results. The result is saved as the athlete's own food (`source = 'web'`, `verified = false`, `source_url`), so the next log is a database read. At most 3 lookups per describe. A failed lookup is "no match", never an error.
- **The home screen only shows the day.** Supplements are one line, and a single Add food button opens the sheet on the tab used last. Each meal's + opens it for that meal.
- **Migration 016 was tested on a Neon branch of production first** (`migrate-016-test`): applied, 14,614 foods unchanged, a web row inserts, a duplicate for the same athlete is ignored, another athlete can cache the same product, a bogus source is still rejected. Then applied to production.
- **Lookup tiers, cheapest first:** this athlete's cached lookups, then Open Food Facts text search (`search.openfoodfacts.org`: free, ~10 ms, no model tokens; saved for everyone as an `off` row), then the model reading the label. An OFF hit is used only when every query word is in its brand or name and its kcal are present and consistent with its macros: the live API returned a 0 kcal / 46 g protein junk row for "muscleblaze". Tested: OFF found "muscleblaze biozyme whey" in 2 s; the model found a Starbucks latte in 6 s (flagged Unverified, with its source page).
- **"Frequent"** lists foods logged at least twice in 90 days, most often first.
- **Tested on a Neon branch with a synthetic user,** never production: a local dev server with its own AUTH_SECRET, driven by headless Chrome. Search, amount editor, review, log, Frequent, both lookup tiers and describe all worked; 200 ml of milk logs as 206 g.
- **Found while testing:** USDA survey portions such as "Guideline amount per cup of hot cereal" are now hidden; a unit like "roti" doesn't match a portion called "chapati", so that amount falls back to the model's estimate (not fixed).
- **Web lookup, final shape: Open Food Facts, then Firecrawl, nothing else by default.** Firecrawl search (2 credits) ranks the results (the product's own site, then Open Food Facts and nutrition databases; only snippets that show label numbers count), then reads up to three pages at 1 credit each, and a small model with no web search extracts the label from a few thousand characters of the page text. It refuses a different product or form (tea leaves for chai, iced for hot) and anything failing the calorie/macro checks. Benchmark on 10 products: 9 found, avg 3.4 credits and 0.09 cents of model, 3 to 10 s; the one refusal was correct. On the free plan (1,000 credits a month) that is about 300 new foods a month for nothing.
- **Why not the alternatives:** OpenRouter's web plugin is 1.4 to 2.8 cents a lookup with a Gemini model (Google grounding; `max_results` has no effect) and cites Google redirect URLs; forced onto the Exa engine it is 0.75 cents but the model found a label in 1 of 6; Firecrawl's own JSON extraction (5 credits) found 2 of 6 and returned different numbers for the same page twice; a model with no web at all is wrong by 10 to 80%; USDA branded foods are US-only, badly ranked, and include rows like 1,620 kcal per 100 g.
- **OpenRouter's own web search is now opt-in** (`FOOD_LOOKUP_OPENROUTER=1`), a last resort. Without it a miss is "no match" and the food can be added by hand: a wrong food is worse than none.
- **Free-plan limit:** about 12 Firecrawl requests a minute. A 429 waits out `retry_after_seconds` (at most 6 s) and retries once. A describe with several unmatched foods can still hit it.

## 2026-11-03: Phase 2b (supplements, migration 013)

- **One log row per supplement per day,** marked taken, half or skipped, with a `late` flag. A taken dose is a fact to record, not a streak to protect, so the record shows the last 14 days and there are no streaks.
- **Timing rules are config, not code.** Each `timing_rules` row has a citation, and a user override is stored by rule key. The same check runs on every supplement dose and every food log, so coffee or a calcium-rich meal too close to Thyronorm gets flagged as well.
- **One calm summary line** when a rule is broken. The detail and the source sit under Supplements › Timing rules, so a late coffee doesn't set off an alarm.
- **Whey and collagen doses post to the food log,** so protein has one source. Collagen protein is logged but doesn't count toward the 155 g floor by default (its amino acids are incomplete and it has almost no leucine). A profile toggle lets it count.
- **Inventory is worked out, not typed in.** Servings and days left come from restocks, counts and logged doses. Stock is low under 10 days. The daily Garmin cron also sends refill and pre-test reminders, so no second cron is needed on Hobby.
- **Each pre-test checklist item has a source:** stop biotin 72 h before a thyroid test, no hard training 48 h before hs-CRP, follow the doctor's dose instruction, fast when the test needs it.
- **The confirmed stack is seeded by `pnpm supplements:seed`,** not by the migration, because doses are personal data, not schema.

## 2026-11-03: Phase 2 (food logging, migration 012)

- **Foods are stored per 100 g with a source on every row** (INDB, USDA Foundation, USDA SR Legacy, OFF, user, recipe). Each log item keeps a snapshot of its nutrients, so fixing a food later never rewrites a past day.
- **Search uses Postgres for candidates and tested TS for ranking.** Word similarity and full text find candidates. Ranking runs in `src/domain` (relevance, then your own foods, INDB, USDA, OFF, then habit and favourites), so it can be unit tested.
- **40 curated Indian-name aliases with an exact-alias boost** (curd/dahi → yogurt, atta → whole wheat flour, roti → chapati). Without them a search for "banana" returned banana appam.
- **The LLM gives items and grams, never nutrients.** Gemini Flash Lite via OpenRouter, falling back to 2.5 Flash Lite. Nutrients always come from the DB. Grams are picked in this order: stated, usual for you, DB portion, model estimate.
- **Text logging prefers cooked foods over raw,** except for foods eaten raw (fruit, veg, nuts, dairy, eggs) and exact aliases.
- **Open Food Facts is a live barcode lookup with a cache,** not a bulk import. The bulk importer only loads USDA and INDB. An OFF row is saved the first time its barcode is scanned.
- **The MFP import is meal-level and idempotent.** The export only has meal totals, so history comes in as one item per meal, and re-running the import never duplicates anything.
- **The food log replaces the MFP → Health Shortcut bridge for protein.** `daily_check_ins.protein` takes the food log as a source, and a typed value still wins.
- **The bottom nav grid follows the tab count.** Food became a fifth tab, and the fixed four-column grid overflowed.

## 2026-11-03: Phase 1 (Garmin sync, migration 011)

- **Gym sessions stay on *Fitness Equipment*** on the watch. *Strength* needs a button press per set, Olympus already records the sets, and sessions are matched to Garmin by time either way.
- **Range responses are stored per item,** one `raw_garmin` row per endpoint and day (or activity), and replaced on re-fetch. The table can't grow without bound, and any day can be re-parsed alone. FIT files aren't stored, because Garmin serves them again on request. Their parsed 1 Hz HR, laps and sets go in `activity_streams`.
- **`daily_wearable` is per device** (`date` + `source`). `daily_check_ins` remains the merged view everything already reads.
- **Garmin RHR enters the check-in only with Garmin sleep** that night (see garmin-findings.md).
- **A Garmin activity hides the Apple Health copy of itself** (`preferGarmin`): Garmin Connect writes every workout to Health.
- **The first sync covers 90 days, then each sync runs from the last synced date minus 2 days,** because the watch uploads late. 28-day windows are the largest the stress and steps endpoints accept. Each run parses at most 15 activity files; the rest wait for the next run.
- **Hobby cron runs daily at 03:00 UTC** (07:00 Dubai, 08:30 Bengaluru). Opening the app or calling `get_recovery` refreshes data older than 30 minutes. On iOS that refresh happens after the response, so the Today screen never waits on Garmin.
- **The key's expiry is entered by hand** (the key is opaque). Reminders go out at 14, 7, 3 and 1 days before.
- **The CLI (`pnpm garmin:sync`) maps `server-only` and React's `cache()` the way Next does,** rather than running under the `react-server` condition, which React 18 refuses outside Next.
- **The migration was tested before production:** applied to a temporary Neon copy of production, then the real sync was run twice against it. Checked: no rows lost, no protein or water changes, no typed sleep overwritten, the RHR rule held, Apple Health copies were matched, and a repeat run created no duplicate raw rows. Only then was it applied to production.
- **MyFitnessPal export is per-meal totals,** not individual foods (968 meal rows from 2022–2026, 126 weigh-ins with some waist, neck and hip measurements). It gets imported as meal-level history, and the weigh-ins feed the weight trend. The exercise file is ignored, because Olympus and Garmin are the sources for training.

- **HRV and wearable source order is now Garmin > Whoop > Apple Health** (it was Apple Health first). Garmin Connect never writes HRV to Apple Health, and Apple Health HRV is SDNN, so the old order left a Garmin wearer with no HRV, or the wrong kind. A typed value still beats every sync. The order lives in `src/domain/check-in-sources.ts`, with tests.
- **`get_recovery` reports `hrvMethod`** (rmssd / sdnn) for each day, so Claude never compares across methods.
- **The Garmin client doesn't import `server-only`**, so the discovery script can run it under plain Node. The key is passed in explicitly and never reaches client code.
- **The discovery report records field names and fill rates, never values.** It can be committed; raw responses stay in the gitignored `.garmin-discovery/`.
- **The sync parser waits for the discovery report.** The Swagger page lists DTO names, but which fields an Instinct 2 + Cirqa actually fills is only known from real responses.
- **FIT parsing uses `@garmin/fitsdk`** (Garmin's official SDK). Unzipping uses `fflate` (MIT, tiny). Both are free.
- **Creatine logged as 5 g**, though it was written as "5mg" (5 mg would be a typo-sized dose).

## 2026-11-03: PT companion, Phase 0

- **Extend Olympus in place (brief option a).** One DB and one auth system, so there is one source of truth for workouts. Garmin activities reuse `external_activities`; `daily_check_ins` stays the merged recovery view Claude reads.
- **Native Swift, not Expo.** A working SwiftUI app already exists, with HealthKit, widgets, a Live Activity, an offline outbox and TestFlight. A second iOS app would duplicate all of it.
- **No Turborepo yet.** `src/domain/` is already the pure, tested core. The iOS app is Swift, so a shared TS package buys nothing today.
- **Stay on Vercel, not Render.** Olympus already deploys there. Sync uses a cron, a refresh on app use and a manual trigger.
- **Keep Google OAuth + allowlist** instead of adding passkeys or magic links. It already protects this data, and iOS uses PKCE on the same server.
- **HRV baselines are keyed by source and method** (SDNN vs RMSSD). Values from different devices are never mixed in one baseline.
- **The food log becomes the protein source** for `daily_check_ins`, replacing the MyFitnessPal → Health Shortcut bridge after the MFP history import.
- **Vision bench is staged:** the full grid on 40 images first, then the top configs on the full set, to keep OpenRouter spend low.
- **Energy bank moved to last.** It overlaps with Garmin Body Battery.
