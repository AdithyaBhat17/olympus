# Olympus for iPhone

The native SwiftUI app: Today, live sessions, the finish screen, Log, Progress,
Library, Settings and the 3D form cues, plus Apple Health sync. It talks to the
Next.js server's `/api/v1` (see `src/app/api/v1/`, `src/server/screens/`), which
only accepts the app's own sign-in, and works offline: gym-floor writes queue on
the phone and every screen shows what it last loaded.

## Run it

1. Run `supabase/migration-007-ios-app.sql` on the database the server uses.
2. Start the server (`next dev` on port 3000; Debug builds point at
   `http://localhost:3000`, which the Simulator reaches directly).
3. Open `Olympus.xcodeproj` in Xcode 26 or later and run the `Olympus` scheme.
4. Sign in with Google. The server's own OAuth (`src/server/oauth.ts`) treats
   the app as the built-in client `olympus-ios` with PKCE.

For a real iPhone: set your team under Signing & Capabilities (HealthKit needs
a paid Apple Developer account), change the bundle id `com.adithyabhat.olympus`
if it's taken, and set `OLYMPUS_SERVER_URL` in the Release build settings to
your deployed server.

Debug builds show **Add sample data to Health** in Settings, which writes three
days of samples into the Simulator's Health so there's something to sync.

## Layout

- `Olympus/App`: entry point, shared `AppModel` (API, outbox, toasts), tabs,
  sign-in.
- `Olympus/Core`: sign-in (`Auth`), the API client and response cache, theme
  (the web's Coral palette), haptics, Keychain.
- `Olympus/Features/*`: one folder per area. Synced folders, so new files are
  picked up automatically; Swift file names must be unique across the target.
- `Olympus/Health`: HealthKit reads and background sync. For HRV and resting HR
  the server prefers Apple Health and lets Whoop fill gaps (`upsertCheckIn`).
- `Packages/OlympusCore`: pure logic with no UIKit or HealthKit (API models,
  ports of the web's load and format helpers, the offline outbox, sleep
  merging). `swift test` in that folder runs it on a Mac.
- `Config`: entitlements (HealthKit, background delivery) and extra Info.plist
  keys (the `olympus://` URL scheme, plain http to localhost).
