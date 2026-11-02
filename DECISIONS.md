# Decisions

Newest first. What was decided, and why.

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
