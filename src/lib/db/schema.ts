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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { EXERCISE_CATEGORIES } from "../constants";

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
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(),
  sessionName: text("session_name").notNull(),
  weekNumber: integer("week_number").notNull(),
  blockNumber: text("block_number").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  rpe: numeric("rpe", { precision: 3, scale: 1 }),
  notes: text("notes"),
  orderIndex: integer("order_index").notNull().default(0),
});

// Relations
export const exercisesRelations = relations(exercises, ({ many }) => ({
  sessionExercises: many(sessionExercises),
}));

export const sessionsRelations = relations(sessions, ({ many }) => ({
  sessionExercises: many(sessionExercises),
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
