# Olympus — Forge Your Strength

A mobile-first gym session logging app built with Next.js 14, TypeScript, Tailwind CSS, Neon PostgreSQL, and NextAuth.js.

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Set up Neon database

1. Create a Neon project at [neon.tech](https://neon.tech)
2. Run the schema and seed scripts in the Neon SQL Editor:
   - `supabase/schema.sql` — creates tables and indexes
   - `supabase/seed.sql` — pre-seeds the exercise library

### 3. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy the Client ID and Client Secret

### 4. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in:

```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
AUTH_SECRET=<run: openssl rand -base64 32>
AUTH_GOOGLE_ID=<your-google-client-id>
AUTH_GOOGLE_SECRET=<your-google-client-secret>
```

### 5. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** Neon PostgreSQL + Drizzle ORM
- **Auth:** NextAuth.js v5 (Google OAuth)
- **Charts:** Recharts
- **Icons:** Heroicons
- **Toasts:** Sonner

## Project Structure

```
src/
  app/
    (app)/          # Authenticated app shell (bottom nav)
      log/          # Session logging form (main feature)
      history/      # Session history with filters
      exercises/    # Exercise library
      progress/     # Charts + working weight tracker
    login/          # Google sign-in
    api/auth/       # NextAuth handler
  components/       # Shared components
  lib/
    auth.ts         # NextAuth config
    actions.ts      # Server actions (save session, etc.)
    db/             # Drizzle ORM schema + client
    types.ts        # TypeScript types
    utils.ts        # Utilities
supabase/
  schema.sql        # Database DDL
  seed.sql          # Exercise library seed data
```
