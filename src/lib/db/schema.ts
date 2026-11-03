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
  smallint,
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

/**
 * Heart rate over a session's started→finished window, from the one Health
 * source (Watch, Garmin Connect, ...) that recorded the most of it. Averages
 * are per-minute means; coveredMin is how many minutes had a reading, so a
 * passive wrist reading every few minutes shows up as thin coverage.
 */
export interface SessionHeartRate {
  source: "apple_health";
  device?: string;
  avgHr: number;
  maxHr: number;
  coveredMin: number;
}

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
  heartRate: jsonb("heart_rate").$type<SessionHeartRate | null>(),
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
  /** Collagen protein counts toward the protein floor. Off: incomplete amino acids, negligible leucine. */
  collagenCountsToProtein: boolean("collagen_counts_to_protein").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Recovery, flags, constraints
// ---------------------------------------------------------------------------

export type { CheckInSource, CheckInField } from "@/domain/check-in-sources";
import type { CheckInSource, CheckInField, SyncSource } from "@/domain/check-in-sources";

/**
 * How a night went, from one device. Stage minutes are absent when the device
 * doesn't stage sleep (older Watches, phone-only tracking). Times are local
 * "HH:mm". Whoop adds efficiency and respiratory rate.
 */
export interface SleepDetail {
  source: SyncSource;
  /** Health's name for the app or device that recorded it, e.g. "Garmin Connect". */
  device?: string;
  bedtime?: string;
  wakeTime?: string;
  deepMin?: number;
  remMin?: number;
  lightMin?: number;
  awakeMin?: number;
  awakenings?: number;
  efficiencyPct?: number;
  respiratoryRate?: number;
}

export const dailyCheckIns = pgTable(
  "daily_check_ins",
  {
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    sleepMin: integer("sleep_min"),
    proteinG: integer("protein_g"),
    waterMl: integer("water_ml"),
    /** Garmin and Whoop = RMSSD, Apple Health = SDNN; sources.hrv says which (hrvMethod). */
    hrvMs: integer("hrv_ms"),
    restingHr: integer("resting_hr"),
    sleepDetail: jsonb("sleep_detail").$type<SleepDetail | null>(),
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

export interface IntegrationSyncState {
  /** Last calendar date daily data was fetched through. */
  dailyThrough?: string;
  /** Last day a key-expiry reminder was sent (yyyy-MM-dd). */
  expiryRemindedOn?: string;
}

export const integrations = pgTable(
  "integrations",
  {
    userId: text("user_id").notNull(),
    provider: text("provider").$type<"whoop" | "apple_health" | "garmin">().notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** sha256 of the per-user ingest token (Apple Health shortcut). */
    ingestTokenHash: text("ingest_token_hash"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    /** Garmin: the personal API key, AES-256-GCM encrypted (see src/server/secrets.ts). */
    secretEnc: text("secret_enc"),
    /** Garmin: when the personal API key stops working (the athlete enters it). */
    keyExpiresAt: timestamp("key_expires_at", { withTimezone: true }),
    syncState: jsonb("sync_state").$type<IntegrationSyncState>().notNull().default({}),
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
// Training done outside Olympus (runs, rides, classes), from Apple Health
// ---------------------------------------------------------------------------

export const externalActivities = pgTable(
  "external_activities",
  {
    userId: text("user_id").notNull(),
    source: text("source").$type<"apple_health" | "garmin">().notNull(),
    /** HKWorkout UUID. */
    externalId: text("external_id").notNull(),
    /** Local date the activity started, in the athlete's timezone. */
    date: date("date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    /** Health's activity type, e.g. "running", "cycling", "hiit". */
    activityType: text("activity_type").notNull(),
    /** Health's name for the app or device that recorded it, e.g. "Garmin Connect". */
    device: text("device"),
    durationMin: integer("duration_min").notNull(),
    distanceM: integer("distance_m"),
    activeKcal: integer("active_kcal"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    hrCoveredMin: integer("hr_covered_min"),
    /** Garmin extras: training effect, load, activity name, local offset. */
    details: jsonb("details").$type<ActivityDetails | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.source, t.externalId] }),
    index("idx_external_activities_user_start").on(t.userId, t.startedAt),
  ]
);

export type ExternalActivityRow = typeof externalActivities.$inferSelect;

export interface ActivityDetails {
  name?: string;
  aerobicEffect?: number;
  anaerobicEffect?: number;
  trainingLoad?: number;
  effectLabel?: string;
  /** Minutes east of UTC where it was recorded. */
  utcOffsetMin?: number;
  totalKcal?: number;
}

export interface FitLap {
  start: string;
  durationSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  distanceM: number | null;
}

/** Per-second detail from an activity's FIT file. */
export const activityStreams = pgTable(
  "activity_streams",
  {
    userId: text("user_id").notNull(),
    source: text("source").$type<"garmin">().notNull(),
    externalId: text("external_id").notNull(),
    hrStart: timestamp("hr_start", { withTimezone: true }),
    hrT: integer("hr_t").array().notNull().default([]),
    hrBpm: smallint("hr_bpm").array().notNull().default([]),
    laps: jsonb("laps").$type<FitLap[]>().notNull().default([]),
    strengthSets: jsonb("strength_sets").$type<unknown[]>().notNull().default([]),
    fitMeta: jsonb("fit_meta").$type<Record<string, unknown> | null>(),
    parsedAt: timestamp("parsed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source, t.externalId] })]
);

// ---------------------------------------------------------------------------
// Garmin raw responses + per-device daily wearable data
// ---------------------------------------------------------------------------

export const rawGarmin = pgTable(
  "raw_garmin",
  {
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    resourceKey: text("resource_key").notNull(),
    localDate: date("local_date"),
    payload: jsonb("payload").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    firstFetchedAt: timestamp("first_fetched_at", { withTimezone: true }).defaultNow().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.endpoint, t.resourceKey] }),
    index("idx_raw_garmin_user_date").on(t.userId, t.localDate),
  ]
);

export interface SleepNeed {
  baselineMin?: number;
  actualMin?: number;
  feedback?: string;
  trainingFeedback?: string;
  sleepHistoryAdjustment?: string;
  hrvAdjustment?: string;
  napAdjustment?: string;
  /** Minutes after local midnight. */
  bedtimeStartMin?: number;
  bedtimeEndMin?: number;
}

export const dailyWearable = pgTable(
  "daily_wearable",
  {
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    source: text("source").$type<"garmin" | "whoop" | "apple_health">().notNull(),
    hrvMs: smallint("hrv_ms"),
    hrvMethod: text("hrv_method").$type<"rmssd" | "sdnn">(),
    hrvWeeklyAvgMs: smallint("hrv_weekly_avg_ms"),
    hrv5minHighMs: smallint("hrv_5min_high_ms"),
    hrvStatus: text("hrv_status"),
    restingHr: smallint("resting_hr"),
    sleepMin: smallint("sleep_min"),
    deepMin: smallint("deep_min"),
    lightMin: smallint("light_min"),
    remMin: smallint("rem_min"),
    awakeMin: smallint("awake_min"),
    awakenings: smallint("awakenings"),
    napMin: smallint("nap_min"),
    sleepStart: timestamp("sleep_start", { withTimezone: true }),
    sleepEnd: timestamp("sleep_end", { withTimezone: true }),
    sleepUtcOffsetMin: smallint("sleep_utc_offset_min"),
    sleepHrAvg: smallint("sleep_hr_avg"),
    respirationAvg: numeric("respiration_avg", { precision: 4, scale: 1, mode: "number" }),
    spo2Avg: numeric("spo2_avg", { precision: 4, scale: 1, mode: "number" }),
    sleepStressAvg: smallint("sleep_stress_avg"),
    sleepNeed: jsonb("sleep_need").$type<SleepNeed | null>(),
    stressAvg: smallint("stress_avg"),
    stress: jsonb("stress").$type<Record<string, number> | null>(),
    bodyBattery: jsonb("body_battery").$type<Record<string, number> | null>(),
    steps: integer("steps"),
    moderateMin: smallint("moderate_min"),
    vigorousMin: smallint("vigorous_min"),
    activeKcal: integer("active_kcal"),
    jetLag: jsonb("jet_lag").$type<Record<string, unknown> | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date, t.source] })]
);

export type DailyWearableInsert = typeof dailyWearable.$inferInsert;

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

// ---------------------------------------------------------------------------
// Food (Phase 2): database, recipes, logs, weigh-ins. See migration-012-food.sql.
// ---------------------------------------------------------------------------

export type FoodSourceKind = "user" | "recipe" | "indb" | "usda_foundation" | "usda_sr" | "off";

const num = (name: string, precision: number, scale: number) => numeric(name, { precision, scale, mode: "number" });

export const foods = pgTable("foods", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id"),
  source: text("source").$type<FoodSourceKind>().notNull(),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode"),
  category: text("category"),
  aliases: text("aliases").array().notNull().default([]),
  searchText: text("search_text").notNull(),
  kcal100g: num("kcal_100g", 7, 2).notNull(),
  protein100g: num("protein_100g", 6, 2),
  carbs100g: num("carbs_100g", 6, 2),
  fat100g: num("fat_100g", 6, 2),
  fibre100g: num("fibre_100g", 6, 2),
  sugar100g: num("sugar_100g", 6, 2),
  sodiumMg100g: num("sodium_mg_100g", 8, 2),
  micros: jsonb("micros").$type<Record<string, number>>().notNull().default({}),
  tags: text("tags").array().notNull().default([]),
  servingG: num("serving_g", 7, 1),
  servingLabel: text("serving_label"),
  recipeYieldG: num("recipe_yield_g", 8, 1),
  verified: boolean("verified").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type FoodRow = typeof foods.$inferSelect;
export type FoodInsert = typeof foods.$inferInsert;

export const foodPortions = pgTable(
  "food_portions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    grams: num("grams", 7, 1).notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [uniqueIndex("food_portions_food_id_label_key").on(t.foodId, t.label)]
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => foods.id),
    grams: num("grams", 7, 1).notNull(),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.position] })]
);

export type FoodInputMode = "search" | "text" | "photo" | "barcode" | "saved" | "recipe" | "supplement" | "mfp_import";

export const foodLogs = pgTable("food_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull(),
  tz: text("tz").notNull(),
  localDate: date("local_date").notNull(),
  meal: text("meal").$type<"breakfast" | "lunch" | "dinner" | "snack">().notNull(),
  inputMode: text("input_mode").$type<FoodInputMode>().notNull(),
  rawText: text("raw_text"),
  note: text("note"),
  model: text("model"),
  costUsd: num("cost_usd", 8, 5),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const foodLogItems = pgTable("food_log_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  logId: uuid("log_id")
    .notNull()
    .references(() => foodLogs.id, { onDelete: "cascade" }),
  position: smallint("position").notNull().default(0),
  foodId: uuid("food_id").references(() => foods.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  foodSource: text("food_source").notNull(),
  grams: num("grams", 7, 1),
  kcal: num("kcal", 7, 1).notNull(),
  proteinG: num("protein_g", 6, 1).notNull().default(0),
  carbsG: num("carbs_g", 6, 1).notNull().default(0),
  fatG: num("fat_g", 6, 1).notNull().default(0),
  fibreG: num("fibre_g", 6, 1).notNull().default(0),
  countsToProtein: boolean("counts_to_protein").notNull().default(true),
  estGrams: num("est_grams", 7, 1),
  confidence: num("confidence", 3, 2),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One "describe what you ate" attempt and what was finally saved (migration 014). */
export const foodParseEvents = pgTable("food_parse_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  text: text("text").notNull(),
  client: text("client").$type<"web" | "ios">(),
  model: text("model"),
  latencyMs: integer("latency_ms"),
  costUsd: num("cost_usd", 8, 5),
  error: text("error"),
  draft: jsonb("draft").$type<ParseDraftItem[]>().notNull().default([]),
  foodLogId: uuid("food_log_id").references(() => foodLogs.id, { onDelete: "set null" }),
  loggedAt: timestamp("logged_at", { withTimezone: true }),
  final: jsonb("final").$type<ParseFinalItem[] | null>(),
  unmatched: smallint("unmatched").notNull().default(0),
  kept: smallint("kept"),
  regrammed: smallint("regrammed"),
  swapped: smallint("swapped"),
  removed: smallint("removed"),
  added: smallint("added"),
});

export interface ParseDraftItem {
  said: string;
  search: string;
  quantity: number;
  unit: string;
  estGrams: number;
  grams: number;
  basis: string;
  confidence: number;
  matchId: string | null;
  matchName: string | null;
  matchSource: string | null;
  alternativeIds: string[];
}

export interface ParseFinalItem {
  foodId: string;
  name: string;
  grams: number;
}

export const foodFavourites = pgTable(
  "food_favourites",
  {
    userId: text("user_id").notNull(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.foodId] })]
);

export const savedMeals = pgTable(
  "saved_meals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("saved_meals_user_id_name_key").on(t.userId, t.name)]
);

export const savedMealItems = pgTable(
  "saved_meal_items",
  {
    mealId: uuid("meal_id")
      .notNull()
      .references(() => savedMeals.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    grams: num("grams", 7, 1).notNull(),
  },
  (t) => [primaryKey({ columns: [t.mealId, t.position] })]
);

export const weighIns = pgTable(
  "weigh_ins",
  {
    userId: text("user_id").notNull(),
    source: text("source").$type<"manual" | "mfp" | "apple_health" | "withings" | "garmin">().notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    tz: text("tz").notNull(),
    localDate: date("local_date").notNull(),
    kg: num("kg", 5, 2),
    bodyFatPct: num("body_fat_pct", 4, 1),
    waistCm: num("waist_cm", 5, 1),
    neckCm: num("neck_cm", 5, 1),
    hipsCm: num("hips_cm", 5, 1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.source, t.measuredAt] })]
);

// ---------------------------------------------------------------------------
// Supplements, timing rules, labs (Phase 2b). See migration-013-supplements.sql.
// ---------------------------------------------------------------------------

export type SupplementSlot = "waking" | "breakfast" | "lunch" | "dinner" | "pre_workout" | "post_workout" | "bedtime" | "any";

export const supplements = pgTable("supplements", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  form: text("form").$type<"tablet" | "capsule" | "softgel" | "powder" | "liquid" | "gummy" | "other">().notNull().default("tablet"),
  servingDesc: text("serving_desc").notNull().default("1 serving"),
  servingsPerDose: num("servings_per_dose", 5, 2).notNull().default(1),
  servingsPerContainer: num("servings_per_container", 7, 1),
  slot: text("slot").$type<SupplementSlot>().notNull(),
  activeDays: smallint("active_days").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  markers: text("markers").array().notNull().default([]),
  foodId: uuid("food_id").references(() => foods.id),
  foodGramsPerServing: num("food_grams_per_serving", 6, 1),
  whereToBuy: jsonb("where_to_buy").$type<Array<{ region: string; note: string }>>().notNull().default([]),
  notes: text("notes"),
  position: smallint("position").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type SupplementRow = typeof supplements.$inferSelect;

export const supplementIngredients = pgTable(
  "supplement_ingredients",
  {
    supplementId: uuid("supplement_id")
      .notNull()
      .references(() => supplements.id, { onDelete: "cascade" }),
    nutrient: text("nutrient").notNull(),
    amount: num("amount", 10, 3).notNull(),
    unit: text("unit").$type<"mcg" | "mg" | "g" | "IU" | "kcal" | "%">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.supplementId, t.nutrient] })]
);

export const supplementLogs = pgTable(
  "supplement_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    supplementId: uuid("supplement_id")
      .notNull()
      .references(() => supplements.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    tz: text("tz").notNull(),
    localDate: date("local_date").notNull(),
    status: text("status").$type<"taken" | "half" | "skipped">().notNull(),
    doseMultiplier: num("dose_multiplier", 4, 2).notNull(),
    late: boolean("late").notNull().default(false),
    foodLogId: uuid("food_log_id").references(() => foodLogs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("supplement_logs_user_id_supplement_id_local_date_key").on(t.userId, t.supplementId, t.localDate)]
);

export const supplementInventory = pgTable("supplement_inventory", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  supplementId: uuid("supplement_id")
    .notNull()
    .references(() => supplements.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  servings: num("servings", 7, 1).notNull(),
  kind: text("kind").$type<"restock" | "count">().notNull(),
  region: text("region"),
  note: text("note"),
});

export const timingRules = pgTable("timing_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id"),
  key: text("key").notNull(),
  subjectTag: text("subject_tag").notNull(),
  objectTag: text("object_tag").notNull(),
  minGapMin: integer("min_gap_min").notNull(),
  direction: text("direction").$type<"after" | "either">().notNull(),
  message: text("message").notNull(),
  citation: text("citation").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const labResults = pgTable(
  "lab_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    drawnOn: date("drawn_on").notNull(),
    marker: text("marker").notNull(),
    value: num("value", 10, 3).notNull(),
    unit: text("unit").notNull(),
    refLow: num("ref_low", 10, 3),
    refHigh: num("ref_high", 10, 3),
    lab: text("lab"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("lab_results_user_id_drawn_on_marker_key").on(t.userId, t.drawnOn, t.marker)]
);

export const labAppointments = pgTable("lab_appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  tz: text("tz").notNull(),
  markers: text("markers").array().notNull().default([]),
  fasting: boolean("fasting").notNull().default(false),
  note: text("note"),
  thyroidMedInstruction: text("thyroid_med_instruction"),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
