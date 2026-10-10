import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  pgEnum,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { EXERCISE_CATEGORIES } from "../constants";
import type {
  LoadMode,
  PlanSet,
  PlanStatus,
  RecoveryGate,
  SetLogEntry,
} from "@/domain/types";

export const exerciseCategoryEnum = pgEnum(
  "exercise_category",
  EXERCISE_CATEGORIES as unknown as [string, ...string[]]
);

export const exerciseStatusEnum = pgEnum("exercise_status", [
  "YES",
  "SUB",
  "NO",
]);

export const exercises = pgTable("exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  category: exerciseCategoryEnum("category").notNull(),
  status: exerciseStatusEnum("status").notNull().default("YES"),
  isCustom: boolean("is_custom").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // --- LiftLog v2 ---
  slug: text("slug"),
  equipment: text("equipment"),
  loadMode: text("load_mode").$type<LoadMode>().notNull().default("TOTAL"),
  carriageKgPerSide: numeric("carriage_kg_per_side", {
    precision: 5,
    scale: 2,
  }),
  blockedReason: text("blocked_reason"),
  substituteIds: uuid("substitute_ids").array().notNull().default([]),
  isCompound: boolean("is_compound").notNull().default(false),
  bodyRegion: text("body_region").$type<"upper" | "lower">(),
  formCueId: text("form_cue_id"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(),
  sessionName: text("session_name").notNull(),
  weekNumber: integer("week_number").notNull().default(1),
  blockNumber: text("block_number").notNull().default("1"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // --- LiftLog v2 ---
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  sessionType: text("session_type"),
  status: text("status")
    .$type<"IN_PROGRESS" | "DONE">()
    .notNull()
    .default("DONE"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  /** In-session swaps: planItemId → the exercise actually done. */
  swaps: jsonb("swaps")
    .$type<Record<string, { exerciseId: string; reason?: string | null }>>()
    .notNull()
    .default({}),
});

/** Legacy alias kept so older components keep compiling. */
export type SetDetail = SetLogEntry;

export const sessionExercises = pgTable("session_exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id),
  sets: integer("sets").notNull(),
  reps: integer("reps").notNull(),
  weight: numeric("weight", { precision: 6, scale: 2 }).notNull(),
  setDetails: jsonb("set_details").$type<SetLogEntry[]>(),
  rpe: numeric("rpe", { precision: 3, scale: 1 }),
  notes: text("notes"),
  orderIndex: integer("order_index").notNull().default(0),
  // --- LiftLog v2 ---
  planItemId: uuid("plan_item_id"),
});

// ---------------------------------------------------------------------------
// Plans pushed by Claude (or built by hand)
// ---------------------------------------------------------------------------

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    sessionType: text("session_type").notNull(),
    title: text("title").notNull(),
    source: text("source").$type<"claude" | "manual">().notNull(),
    clientRef: text("client_ref").notNull(),
    status: text("status").$type<PlanStatus>().notNull().default("READY"),
    coachNotes: text("coach_notes"),
    recoveryGate: jsonb("recovery_gate").$type<RecoveryGate | null>(),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    pushedAt: timestamp("pushed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("idx_plans_user_client_ref").on(t.userId, t.clientRef),
    index("idx_plans_user_date").on(t.userId, t.date),
  ]
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer("order_index").notNull(),
    pairGroup: text("pair_group"),
    restSec: integer("rest_sec").notNull().default(120),
    straps: boolean("straps").notNull().default(false),
    cues: text("cues").array().notNull().default([]),
    sets: jsonb("sets").$type<PlanSet[]>().notNull(),
    overrideReason: text("override_reason"),
  },
  (t) => [index("idx_plan_items_plan").on(t.planId)]
);

// ---------------------------------------------------------------------------
// Athlete profile: what "today" means, their targets, their rotation
// ---------------------------------------------------------------------------

export const athleteProfiles = pgTable("athlete_profiles", {
  userId: text("user_id").primaryKey(),
  /** IANA zone. NULL until the browser reports one (or the athlete picks it). */
  timezone: text("timezone"),
  /** From the Google sign-in, for the iOS app (the web reads the session). */
  displayName: text("display_name"),
  /** Nutrition targets. NULL = not tracked; nothing is judged against it. */
  kcal: integer("kcal"),
  proteinG: integer("protein_g"),
  waterMl: integer("water_ml"),
  /** Sleep floor for the progression gate. */
  minSleepMin: integer("min_sleep_min").notNull().default(360),
  /** Session letters in rotation order, e.g. {A,B,C}. */
  rotation: text("rotation").array().notNull().default(["A", "B", "C"]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Recovery, flags, constraints
// ---------------------------------------------------------------------------

export type CheckInSource = "manual" | "claude" | "whoop" | "apple_health";
export type CheckInField = "sleep" | "protein" | "water" | "hrv" | "rhr";

export const dailyCheckIns = pgTable(
  "daily_check_ins",
  {
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    sleepMin: integer("sleep_min"),
    proteinG: integer("protein_g"),
    waterMl: integer("water_ml"),
    /** Apple Health = SDNN, Whoop = RMSSD; sources.hrv says which. */
    hrvMs: integer("hrv_ms"),
    restingHr: integer("resting_hr"),
    sources: jsonb("sources")
      .$type<Partial<Record<CheckInField, CheckInSource>>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })]
);

export const coachFlags = pgTable(
  "coach_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    text: text("text").notNull(),
    scope: text("scope")
      .$type<"global" | "sessionType" | "exerciseId">()
      .notNull()
      .default("global"),
    scopeValue: text("scope_value"),
    createdBy: text("created_by").$type<"claude" | "user">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("idx_coach_flags_user").on(t.userId)]
);

/** An athlete's injuries and the movement patterns they rule out. */
export const constraints = pgTable("constraints", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Nullable for legacy rows only; the app ignores rows without an owner. */
  userId: text("user_id"),
  region: text("region").notNull(),
  rule: text("rule").notNull(),
  blockedPatterns: text("blocked_patterns").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
});

/** One athlete taking a library exercise off the table, whatever the reason. */
export const exerciseBlocks = pgTable(
  "exercise_blocks",
  {
    userId: text("user_id").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exerciseId] })]
);

export const workingWeightOverrides = pgTable("working_weight_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id),
  kg: numeric("kg", { precision: 6, scale: 2 }).notNull(),
  previousKg: numeric("previous_kg", { precision: 6, scale: 2 }),
  reason: text("reason").notNull(),
  forced: boolean("forced").notNull().default(false),
  createdBy: text("created_by").$type<"claude" | "user">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// MCP: audit log + OAuth 2.1 authorization server state
// ---------------------------------------------------------------------------

export const mcpAuditLog = pgTable(
  "mcp_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    tool: text("tool").notNull(),
    kind: text("kind").$type<"read" | "write">().notNull(),
    ok: boolean("ok").notNull(),
    summary: text("summary"),
    input: jsonb("input"),
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_mcp_audit_user_time").on(t.userId, t.createdAt)]
);

export const oauthClients = pgTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientName: text("client_name"),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope"),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    kind: text("kind").$type<"access" | "refresh">().notNull(),
    clientId: text("client_id").notNull(),
    userId: text("user_id").notNull(),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("idx_oauth_tokens_user").on(t.userId)]
);

// ---------------------------------------------------------------------------
// Web push + third-party integrations (Whoop, Apple Health shortcut)
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const integrations = pgTable(
  "integrations",
  {
    userId: text("user_id").notNull(),
    provider: text("provider").$type<"whoop" | "apple_health">().notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** sha256 of the per-user ingest token (Apple Health shortcut). */
    ingestTokenHash: text("ingest_token_hash"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
    uniqueIndex("idx_integrations_ingest_token").on(t.ingestTokenHash),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const exercisesRelations = relations(exercises, ({ many }) => ({
  sessionExercises: many(sessionExercises),
}));

export const sessionsRelations = relations(sessions, ({ many, one }) => ({
  sessionExercises: many(sessionExercises),
  plan: one(plans, { fields: [sessions.planId], references: [plans.id] }),
}));

export const sessionExercisesRelations = relations(
  sessionExercises,
  ({ one }) => ({
    session: one(sessions, {
      fields: [sessionExercises.sessionId],
      references: [sessions.id],
    }),
    exercise: one(exercises, {
      fields: [sessionExercises.exerciseId],
      references: [exercises.id],
    }),
  })
);

export const plansRelations = relations(plans, ({ many }) => ({
  items: many(planItems),
}));

export const planItemsRelations = relations(planItems, ({ one }) => ({
  plan: one(plans, { fields: [planItems.planId], references: [plans.id] }),
  exercise: one(exercises, {
    fields: [planItems.exerciseId],
    references: [exercises.id],
  }),
}));
