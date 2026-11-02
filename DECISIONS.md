# Decisions

Newest first. What was decided, and why.

## 2026-11-03: Phase 1 (Garmin)

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
