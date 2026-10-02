/**
 * Pure domain types shared by the app UI, server actions and the MCP server.
 * Nothing in src/domain may import from the DB, Next.js or React.
 */

export type LoadMode = "TOTAL" | "PER_SIDE" | "COUNTERWEIGHT";
export type ExStatus = "YES" | "SUB" | "NO";
export type PlanStatus = "DRAFT" | "READY" | "IN_PROGRESS" | "DONE" | "SKIPPED";
export type SessionType = "A" | "B" | "C" | "Cardio" | (string & {});

export interface RecoveryGate {
  minSleepH: number;
  onFail: "hold_progression" | "warn";
}

export interface PlanSet {
  type: "warmup" | "working";
  /** [min, max] reps; [8, 8] for a fixed target. */
  reps: [number, number];
  rpe?: number;
  /** Load to open at, in true kg (per side for PER_SIDE, counterweight for COUNTERWEIGHT). */
  openKg?: number;
}

/** One logged set, stored in session_exercises.set_details. */
export interface SetLogEntry {
  reps: number;
  /** True load in kg (plates + carriage for PER_SIDE). Always stored. */
  weight: number;
  /** What the user typed for PER_SIDE machines. */
  platesKg?: number | null;
  rpe?: number | null;
  type?: "warmup" | "working";
  flags?: SetFlag[];
  doneAt?: string;
}

export type SetFlag = "underloaded" | "top_set_pr" | "blocked_override";

export interface DomainExercise {
  id: string;
  slug?: string | null;
  name: string;
  category: string;
  status: ExStatus;
  loadMode: LoadMode;
  carriageKgPerSide: number | null;
  isCompound: boolean;
  bodyRegion: "upper" | "lower" | null;
  blockedReason?: string | null;
  substituteIds?: string[];
}

export interface DomainConstraint {
  region: string;
  rule: string;
  blockedPatterns: string[];
}

export interface PlanItemInput {
  exerciseId: string;
  order: number;
  pairGroup?: string | null;
  restSec: number;
  straps?: boolean;
  cues?: string[];
  sets: PlanSet[];
  /** Required to program an exercise that V1 would otherwise block. */
  overrideReason?: string | null;
  /** Claude's stated intent for the load; drives V8 for counterweight machines. */
  progression?: "increase" | "hold" | "decrease";
}

export interface PlanInput {
  clientRef: string;
  date: string;
  sessionType: SessionType;
  title: string;
  coachNotes?: string | null;
  recoveryGate?: RecoveryGate | null;
  items: PlanItemInput[];
}

export type RuleCode =
  | "V0"
  | "V1"
  | "V2"
  | "V3"
  | "V4"
  | "V5"
  | "V6"
  | "V7"
  | "V8"
  | "V9"
  | "V10";

export interface Issue {
  code: RuleCode;
  level: "error" | "warning";
  message: string;
  exerciseId?: string;
}

export interface ValidationContext {
  exercises: Map<string, DomainExercise>;
  constraints: DomainConstraint[];
  /** Last session's top working set per exercise id, in true kg. */
  lastTopSetKg: Map<string, number>;
  /** Today's sleep in minutes, if known. */
  sleepMinToday: number | null;
  /** A plan for the same date + sessionType is already IN_PROGRESS. */
  inProgressPlanExists: boolean;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}
