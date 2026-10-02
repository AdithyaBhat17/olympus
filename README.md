# Olympus — LiftLog

A mobile-first training log (PWA) that your PT programmes through Claude.
Claude reads your history and pushes today's plan into the app; you train
from the Today screen, log sets live, and hit **Send to PT** when you finish.

Built with Next.js 15 (App Router), TypeScript, Tailwind, Postgres (Neon) +
Drizzle, NextAuth (Google), and a remote MCP server at `/api/mcp`.

## The loop

```
Claude (PT project)                  LiftLog MCP (/api/mcp)                 App
"Heading to the gym" ──► get_athlete_context, get_sessions, get_recovery
Claude drafts Session B, you approve
                     ──► push_plan ──► validate (V1–V10) ──► Today: "Session B · From your PT 16:40" + push
                                                ... you train, log sets live ...
                                                                          Finish ▸ Send to PT
"Review today"       ──► get_sessions (planned vs actual, RPE, flags)
                     ──► update_working_weight / add_coach_flag
```

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Database

Run these in order in the Neon SQL editor (or `psql`). They're idempotent.

1. `supabase/schema.sql` — base tables
2. `supabase/migration-001-security.sql`, `supabase/migration-002-per-set-details.sql`
3. `supabase/seed.sql` — exercise library
4. `supabase/migration-003-liftlog-v2.sql` — plans, check-ins, coach flags,
   constraints, MCP OAuth + audit, push, integrations
5. `supabase/seed-002-liftlog-v2.sql` — injury constraints, load modes,
   carriage values, and the machines the programme uses (with slugs Claude
   uses as `exerciseId`)

A Neon URL uses Neon's HTTP driver. Any other URL uses node-postgres, so
local Postgres works for development.

### 3. Google OAuth

Create an OAuth client (Web) in Google Cloud Console with redirect URI
`<APP_URL>/api/auth/callback/google`.

### 4. Environment

```bash
cp .env.local.example .env.local
```

Every variable is documented in `.env.local.example`. You need at least
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and
`APP_URL`. Set `MCP_ALLOWED_EMAILS` to lock the MCP to your account.

### 5. Run

```bash
pnpm dev          # app
pnpm test         # domain rule tests (vitest)
pnpm typecheck
```

## Connect Claude (LiftLog MCP)

The MCP server is a remote **Streamable HTTP** server at `<APP_URL>/api/mcp`
(stateless JSON responses, so it runs on Vercel serverless). Auth is OAuth 2.1
per the MCP authorization spec: the app is its own authorization server
(dynamic client registration, PKCE S256, rotating refresh tokens), and you
sign in with the same Google account you use in the app.

- **Claude (web, desktop, phone):** Settings › Connectors › Add custom
  connector › paste `<APP_URL>/api/mcp`, then sign in and approve.
- **Claude Code** (OAuth): `claude mcp add --transport http liftlog <APP_URL>/api/mcp`
- **Claude Code with a static key** (no browser): set `MCP_API_KEY` +
  `MCP_API_KEY_USER`, then
  `claude mcp add --transport http liftlog <APP_URL>/api/mcp --header "Authorization: Bearer $MCP_API_KEY"`

Settings › Connections in the app shows connected clients, the last tool call,
and an audit log of every write Claude made. You can disconnect from there too.

| Tools | |
|---|---|
| Read | `get_athlete_context`, `get_sessions`, `get_recovery`, `get_exercise_history`, `search_exercises` |
| Write | `push_plan`, `update_plan`, `log_session`, `update_working_weight`, `add_coach_flag`, `resolve_coach_flag`, `upsert_check_in` |
| Resources | `liftlog://log/latest.md`, `liftlog://session/{date}.md` |
| Prompt | `programme_next_session` |

There are no delete tools. Deletes happen in the app only.

### Validation rules (`src/domain/validation.ts`)

`push_plan` runs these server-side. **Errors** block the write; **warnings**
are returned to Claude and shown on Today.

| # | Rule | Level |
|---|---|---|
| V1 | Exercise is `NO` or matches an injury constraint's blocked pattern | Error unless `overrideReason` |
| V2 | Chest press and triceps isolation in the same `pairGroup` | Error |
| V3 | Working `openKg` > 15% under last session's top set | Warning |
| V4 | Load increase while sleep is under the `recoveryGate` | Warning |
| V5 | Increment off-rule (upper +2.5, lower +5, accessories reps first) | Warning |
| V6 | Compound rest under 150 s | Warning |
| V7 | Per-side machine with no carriage weight | Warning |
| V8 | Counterweight machine with a higher number sold as progress | Error |
| V9 | No log history (calibration weight) | Warning |
| V10 | A plan for that date + type is already in progress | Error |

`update_working_weight` rejects jumps of more than 2 increments without
`force` + reason (the 50 → 90 kg squat).

## Recovery data sources

The Today check-in (sleep, protein, water) can be typed in the app, told to
Claude (`upsert_check_in`), or synced. A value you enter yourself is never
overwritten by a sync.

### Whoop → sleep

1. Create an app at [developer.whoop.com](https://developer.whoop.com) with
   scopes `offline read:sleep read:recovery` and redirect URI
   `<APP_URL>/api/integrations/whoop/callback`.
2. Set `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET`.
3. In the app: Settings › Connections › Whoop › Connect.

Sleep is time asleep (in bed − awake − no data), dated by the morning you
woke up. It refreshes in the background every 30 minutes while you use the
app, and whenever Claude calls `get_recovery`.

### MyFitnessPal / Apple Health → protein and water

MyFitnessPal has no public API, and Apple Health has no web API (HealthKit
only runs on the iPhone). The bridge runs from your phone:

1. MyFitnessPal › Settings › Sharing & Privacy › Apple Health: allow writing
   Protein and Water.
2. Settings › Connections › Apple Health › **Create token** in the app.
3. Build an iOS Shortcut: *Find Health Samples* (Protein, today) → *Calculate
   Statistics* (Sum); the same for Water (mL); then *Get Contents of URL*:
   `POST <APP_URL>/api/ingest/health`, header `Authorization: Bearer <token>`,
   JSON body `{ "proteinG": …, "waterMl": … }`.
4. Add a Personal Automation: *When MyFitnessPal is closed* → run it.

The endpoint also accepts `waterL`, `sleepMin`/`sleepH`, an explicit `date`,
or `{ "days": [...] }` to backfill.

### Web push

Generate keys with `npx web-push generate-vapid-keys`, set the three `VAPID`
variables, then turn on notifications in Settings. On iPhone, add the app to
the Home Screen first.

## Project structure

```
src/
  domain/             # Pure business rules. The app UI and MCP both call these.
    load.ts           #   true-load maths (plates + carriage), increments, jump guard
    validation.ts     #   V1–V10
    progression.ts    #   double progression ("1 of 2"), live underload nudge
    recovery.ts, rotation.ts, flags.ts, export.ts (Lift Log markdown)
    __tests__/        #   cases from the real log
  server/             # DB-backed services (server-only)
    plans.ts, sessions.ts, history.ts, checkins.ts, flags.ts, athlete.ts
    mcp/server.ts     #   MCP tools, resources, prompt
    oauth.ts          #   OAuth 2.1 authorization server
    integrations/     #   whoop.ts, apple-health.ts
    push.ts, audit.ts
  app/
    (app)/today       # Today: check-in, next session ("From your PT"), coach flags
    (app)/session/[id]          # Live session: rest timer, sets, RPE, load sheet, swap
    (app)/session/[id]/finish   # Finish + Send to PT / Obsidian / copy
    (app)/progress[/id] # Exercise progress + next bump
    (app)/form/[cue]  # Animated form cues
    (app)/history, exercises, log, settings
    api/mcp           # MCP endpoint
    api/oauth/*, oauth/authorize   # OAuth server + consent screen
    api/integrations/whoop/*, api/ingest/health
worker/index.js       # Service-worker push handler (bundled by next-pwa)
supabase/             # SQL schema, migrations, seeds
```
