# Decisions

Newest first. What was decided, and why.

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
