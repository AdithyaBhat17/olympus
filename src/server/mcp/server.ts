import "server-only";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { planItems, plans } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import {
  gateMessage,
  progressionStatus,
  renderLogMarkdown,
  renderSessionMarkdown,
  sessionFileName,
  topSet,
} from "@/domain";
import { getAthleteContext } from "../athlete";
import { getRecovery, upsertCheckIn } from "../checkins";
import { exerciseRef, getConstraints, listExercises, resolveRef, searchExercises } from "../exercises";
import { addFlag, resolveFlag } from "../flags";
import { exerciseHistory } from "../history";
import { pushPlan, updatePlan, type PlanPayload } from "../plans";
import {
  DomainError,
  exportSessions,
  getSessionsDetailed,
  logSessionFull,
} from "../sessions";
import { updateWorkingWeight } from "../working-weight";
import { recordToolCall } from "../audit";
import { syncWhoopIfStale } from "../integrations/whoop";
import { getProfile, todayFor } from "../profile";

export interface McpCaller {
  userId: string;
  clientId: string;
}

// ---------------------------------------------------------------------------
// Shared input schemas
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const repsSchema = z
  .array(z.number().int().min(0).max(100))
  .min(1)
  .max(2)
  .describe("[min, max] reps, or [n] for a fixed target. Cardio (loadMode TIME): minutes, e.g. [35]")
  .transform((r) => (r.length === 1 ? [r[0], r[0]] : [r[0], r[1]]) as [number, number]);

const planSetSchema = z.object({
  type: z.enum(["warmup", "working"]),
  reps: repsSchema,
  rpe: z.number().min(1).max(10).optional(),
  openKg: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe("Load to open at in TRUE kg (per side for PER_SIDE machines, counterweight for COUNTERWEIGHT). Omit for cardio."),
});

const planItemSchema = z.object({
  exerciseId: z.string().min(1).describe("Exercise slug (e.g. 'barbell-deadlift'), uuid, or exact name"),
  order: z.number().int().min(0),
  pairGroup: z.string().max(20).nullable().optional().describe("Superset/alternation group label"),
  restSec: z.number().int().min(0).max(900).describe("Compounds default 180"),
  straps: z.boolean().optional(),
  cues: z
    .array(z.string().max(200))
    .max(8)
    .optional()
    .describe("Coaching cues. For cardio put speed, incline and HR targets here."),
  sets: z.array(planSetSchema).min(1).max(12),
  overrideReason: z
    .string()
    .max(300)
    .nullable()
    .optional()
    .describe("Required to programme an exercise V1 would block"),
  progression: z
    .enum(["increase", "hold", "decrease"])
    .optional()
    .describe("Your intent for the load vs last session; drives the counterweight check (V8)"),
});

const recoveryGateSchema = z.object({
  minSleepH: z.number().min(0).max(12),
  onFail: z.enum(["hold_progression", "warn"]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(summary: string, data: Record<string, unknown> = {}): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ summary, ...data }, null, 2) }] };
}

function fail(summary: string, data: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ summary, ...data }, null, 2) }],
    isError: true,
  };
}

function summaryOf(r: ToolResult): string {
  try {
    return JSON.parse(r.content[0].text).summary ?? "";
  } catch {
    return "";
  }
}

/** Latest planned rep range + RPE for an exercise, for progression maths. */
async function plannedRange(userId: string, exerciseId: string) {
  const [row] = await db
    .select({ sets: planItems.sets })
    .from(planItems)
    .innerJoin(plans, eq(plans.id, planItems.planId))
    .where(and(eq(plans.userId, userId), eq(planItems.exerciseId, exerciseId)))
    .orderBy(desc(plans.pushedAt))
    .limit(1);
  const working = row?.sets.find((s) => s.type === "working");
  return { repTop: working?.reps[1], targetRpe: working?.rpe };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function buildMcpServer(caller: McpCaller): McpServer {
  const { userId } = caller;
  const server = new McpServer(
    { name: "olympus-liftlog", version: "2.0.0" },
    {
      instructions: [
        "LiftLog is the signed-in athlete's training log. The app is the single source of truth; you are the programmer that reads and writes it. Everything here (injuries, targets, rotation, timezone) is that athlete's own: take it from the tools, never assume it.",
        "Before programming: get_athlete_context, then get_sessions for the last 2 sessions of the type that's due, then get_recovery.",
        "Loads are TRUE kg: per side for iso-lateral (PER_SIDE) machines, and for COUNTERWEIGHT machines a LOWER number is harder.",
        "push_plan validates against rules V1–V10. Errors block the write; warnings don't. Get the athlete's approval in chat before pushing.",
        "There are no delete tools. Deletes happen in the app only.",
      ].join("\n"),
    }
  );

  /** Wraps a handler with audit logging + uniform error handling. */
  function tool<S extends z.ZodRawShape>(
    name: string,
    kind: "read" | "write",
    config: { title: string; description: string; inputSchema: S },
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>
  ) {
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.inputSchema,
        annotations: {
          title: config.title,
          readOnlyHint: kind === "read",
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      // The SDK's generic callback type doesn't narrow through our wrapper.
      (async (args: z.infer<z.ZodObject<S>>) => {
        let result: ToolResult;
        try {
          result = await handler(args);
        } catch (err) {
          result =
            err instanceof DomainError
              ? fail(err.message)
              : (console.error(`mcp tool ${name} failed`, err), fail("Internal error. Nothing was written."));
        }
        await recordToolCall({
          userId,
          tool: name,
          kind,
          ok: !result.isError,
          summary: summaryOf(result),
          input: args,
          clientId: caller.clientId,
        });
        return result;
      }) as never
    );
  }

  // ------------------------------------------------------------------ Read

  tool(
    "get_athlete_context",
    "read",
    {
      title: "Athlete context",
      description:
        "Constraints (injuries + blocked movement patterns), working weights (latest true load per exercise), rotation (the athlete's session letters in order, the last one done and the next due), open coach flags, today's recovery, the upcoming plan, the sleep floor, and nutrition targets (null = not tracked, so don't judge against it). Dates are in the athlete's timezone.",
      inputSchema: {},
    },
    async () => {
      const ctx = await getAthleteContext(userId);
      return ok(
        `Next due: Session ${ctx.rotation.nextDue}. ${ctx.workingWeights.length} working weights, ${ctx.constraints.length} constraints, ${ctx.openCoachFlags.length} open flags.${ctx.blockedLifts.length ? ` ${ctx.blockedLifts.length} blocked lift(s) listed separately. Never programme them.` : ""} Progression gate: ${ctx.progressionGate}. ${ctx.progressionGateMessage}`,
        ctx
      );
    }
  );

  tool(
    "get_sessions",
    "read",
    {
      title: "Get sessions",
      description:
        "Logged sessions with planned vs actual per set (kg, reps, RPE), auto-flags (underloaded, top_set_pr, blocked_override), swaps, whether it was sent to PT, and that day's check-in. Newest first.",
      inputSchema: {
        from: isoDate.optional(),
        to: isoDate.optional(),
        sessionType: z.string().max(20).optional().describe("A rotation letter (get_athlete_context rotation.order) or Cardio"),
        exerciseId: z.string().optional().describe("Only sessions containing this exercise (slug, uuid or name)"),
        limit: z.number().int().min(1).max(30).default(5),
        includeInProgress: z.boolean().default(false),
      },
    },
    async (a) => {
      const rows = await getSessionsDetailed(userId, a);
      return ok(
        rows.length
          ? `${rows.length} session(s): ${rows.map((r) => `${r.date} ${r.sessionType ? `Session ${r.sessionType}` : r.title}`).join(", ")}.`
          : "No sessions match.",
        { sessions: rows }
      );
    }
  );

  tool(
    "get_recovery",
    "read",
    {
      title: "Get recovery",
      description:
        "Daily check-ins (sleep, protein, water, HRV, resting HR) with where each value came from (manual, Whoop, Apple Health, Claude), plus derived streaks against the athlete's own sleep floor and protein target. HRV is SDNN when sources.hrv is apple_health and RMSSD when it's whoop; don't compare across the two. Refreshes Whoop first if it's connected and stale.",
      inputSchema: {
        date: isoDate.optional().describe("Defaults to today in the athlete's timezone"),
        days: z.number().int().min(1).max(60).default(7),
      },
    },
    async (a) => {
      await syncWhoopIfStale(userId).catch(() => {});
      const date = a.date ?? (await todayFor(userId));
      const r = await getRecovery(userId, date, a.days);
      return ok(
        `${r.checkIns.length} check-in(s) in ${a.days} days.${r.summary.streaks.length ? ` ${r.summary.streaks.join("; ")}.` : ""} Progression gate: ${r.summary.gate}. ${gateMessage(r.summary)}`,
        {
          date,
          today: r.today,
          checkIns: r.checkIns.map((c) => ({
            date: c.date,
            sleepMin: c.sleepMin,
            proteinG: c.proteinG,
            waterMl: c.waterMl,
            hrvMs: c.hrvMs,
            restingHr: c.restingHr,
            sources: c.sources,
          })),
          recovery: r.summary,
        }
      );
    }
  );

  tool(
    "get_exercise_history",
    "read",
    {
      title: "Exercise history",
      description:
        "Top set per session, whether each session hit the top of the rep range at target RPE, and progression status (e.g. '1 of 2' clean sessions before the next increment).",
      inputSchema: {
        exerciseId: z.string().min(1).describe("Slug, uuid or exact name"),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async (a) => {
      const all = await listExercises(userId);
      const ex = resolveRef(all, a.exerciseId);
      if (!ex) throw new DomainError(`Unknown exercise "${a.exerciseId}". Try search_exercises.`);
      const [history, range, recovery] = await Promise.all([
        exerciseHistory(userId, ex.id, a.limit),
        plannedRange(userId, ex.id),
        getRecovery(userId),
      ]);
      const status = progressionStatus(ex, history, {
        repTop: range.repTop,
        targetRpe: range.targetRpe,
        sleepGateFails: recovery.summary.gate === "hold",
        sleepUnknown: recovery.summary.gate === "unknown",
      });
      return ok(`${ex.name}: ${status.summary}`, {
        exercise: { exerciseId: exerciseRef(ex), exerciseUuid: ex.id, name: ex.name, loadMode: ex.loadMode, carriageKgPerSide: ex.carriageKgPerSide },
        progression: status,
        sessions: history.map((h) => {
          const top = topSet(ex.loadMode, h.sets);
          return {
            date: h.date,
            sessionType: h.sessionType,
            topSet: top ? { kg: top.weight, reps: top.reps, rpe: top.rpe ?? null } : null,
            sets: h.sets.map((s) => ({ kg: s.weight, reps: s.reps, rpe: s.rpe ?? null, type: s.type ?? "working", flags: s.flags ?? [] })),
            notes: h.notes,
          };
        }),
      });
    }
  );

  tool(
    "search_exercises",
    "read",
    {
      title: "Search exercises",
      description:
        "Find exercises by name. Returns slug (use it as exerciseId), load mode, carriage, status, blockedReason and substitutes. Blocked exercises are hidden unless includeBlocked=true.",
      inputSchema: {
        query: z.string().max(100),
        includeBlocked: z.boolean().default(false),
      },
    },
    async (a) => {
      const hits = await searchExercises(userId, a.query, a.includeBlocked);
      return ok(`${hits.length} match(es) for "${a.query}".`, { exercises: hits });
    }
  );

  // ----------------------------------------------------------------- Write

  tool(
    "push_plan",
    "write",
    {
      title: "Push plan to Today",
      description:
        "Validate and store a session plan; it shows on the athlete's Today screen with a push notification. Upserts on clientRef (safe to retry). Returns planId, warnings[] and errors[]. Errors block the write; warnings don't. Cardio days use sessionType 'Cardio' and exercises from search_exercises('cardio'): each set's reps are minutes. Only push after the athlete approved the plan in chat.",
      inputSchema: {
        clientRef: z.string().min(1).max(100).describe("Idempotency key, e.g. 'pt-2026-10-02-B'"),
        date: isoDate,
        sessionType: z.string().min(1).max(20).describe("A rotation letter (get_athlete_context rotation.order) or Cardio"),
        title: z.string().min(1).max(100).describe("e.g. 'Back & Biceps'"),
        coachNotes: z.string().max(2000).nullable().optional(),
        recoveryGate: recoveryGateSchema.nullable().optional(),
        items: z.array(planItemSchema).min(1).max(20),
      },
    },
    async (a) => {
      const res = await pushPlan(userId, a as PlanPayload, "claude");
      const payload = { planId: res.planId, status: res.status, errors: res.errors, warnings: res.warnings };
      return res.errors.length ? fail(res.summary, payload) : ok(res.summary, payload);
    }
  );

  tool(
    "update_plan",
    "write",
    {
      title: "Update plan",
      description:
        "Patch a plan while it is still READY (rejected once the session has started). Passing items replaces the whole item list. Re-runs validation.",
      inputSchema: {
        planId: z.string().uuid(),
        date: isoDate.optional(),
        sessionType: z.string().min(1).max(20).optional(),
        title: z.string().min(1).max(100).optional(),
        coachNotes: z.string().max(2000).nullable().optional(),
        recoveryGate: recoveryGateSchema.nullable().optional(),
        items: z.array(planItemSchema).min(1).max(20).optional(),
      },
    },
    async ({ planId, ...patch }) => {
      const res = await updatePlan(userId, planId, patch as Parameters<typeof updatePlan>[2]);
      const payload = { planId: res.planId, status: res.status, errors: res.errors, warnings: res.warnings };
      return res.errors.length ? fail(res.summary, payload) : ok(res.summary, payload);
    }
  );

  tool(
    "log_session",
    "write",
    {
      title: "Log a whole session",
      description:
        "Record a session rebuilt from chat (e.g. Garmin/Strava notes). Same true-load maths and auto-flags as the app: give platesKg for PER_SIDE machines and the carriage is added, or kg for true load. Cardio exercises (loadMode TIME, category Cardio): reps = minutes, no kg, optional avgHr. Blocked exercises are logged with a blocked_override flag.",
      inputSchema: {
        date: isoDate,
        sessionType: z.string().max(20).nullable().optional(),
        title: z.string().min(1).max(100),
        notes: z.string().max(2000).nullable().optional(),
        exercises: z
          .array(
            z.object({
              exerciseId: z.string().min(1),
              notes: z.string().max(500).nullable().optional(),
              sets: z
                .array(
                  z.object({
                    kg: z.number().min(0).max(1000).nullable().optional(),
                    platesKg: z.number().min(0).max(1000).nullable().optional(),
                    reps: z.number().int().min(0).max(1000).describe("Reps; for cardio, minutes"),
                    avgHr: z.number().int().min(30).max(230).nullable().optional().describe("Cardio only"),
                    rpe: z.number().min(1).max(10).nullable().optional(),
                    type: z.enum(["warmup", "working"]).optional(),
                  })
                )
                .min(1)
                .max(20),
            })
          )
          .min(1)
          .max(20),
      },
    },
    async (a) => {
      const res = await logSessionFull(userId, a);
      return ok(
        `Logged ${a.exercises.length} exercise(s) on ${a.date} as session ${res.sessionId}.${res.warnings.length ? ` ${res.warnings.join("; ")}.` : ""}`,
        res
      );
    }
  );

  tool(
    "update_working_weight",
    "write",
    {
      title: "Update working weight",
      description:
        "Audited working-weight override. A jump of more than 2 increments (2.5 kg upper / 5 kg lower) is rejected unless force=true with a reason.",
      inputSchema: {
        exerciseId: z.string().min(1),
        kg: z.number().min(0).max(1000).describe("True kg"),
        reason: z.string().min(3).max(300),
        force: z.boolean().default(false),
      },
    },
    async (a) => {
      const res = await updateWorkingWeight(userId, a, "claude");
      return res.ok ? ok(res.message, res) : fail(res.message, res);
    }
  );

  tool(
    "add_coach_flag",
    "write",
    {
      title: "Add coach flag",
      description:
        "A carry-forward note shown on Today (global), on sessions of a type (sessionType), or on one exercise card (exerciseId).",
      inputSchema: {
        text: z.string().min(1).max(300),
        scope: z.enum(["global", "sessionType", "exerciseId"]).default("global"),
        scopeValue: z
          .string()
          .max(100)
          .optional()
          .describe("Session letter or exercise slug when scope isn't global"),
      },
    },
    async (a) => {
      let scopeValue = a.scopeValue ?? null;
      if (a.scope !== "global" && !scopeValue) {
        throw new DomainError("scopeValue is required unless scope is global");
      }
      if (a.scope === "exerciseId" && scopeValue) {
        const ex = resolveRef(await listExercises(userId), scopeValue);
        if (!ex) throw new DomainError(`Unknown exercise "${scopeValue}"`);
        scopeValue = ex.id;
      }
      const row = await addFlag(userId, { text: a.text, scope: a.scope, scopeValue }, "claude");
      return ok(`Flag added (${a.scope}).`, { flagId: row.id });
    }
  );

  tool(
    "resolve_coach_flag",
    "write",
    {
      title: "Resolve coach flag",
      description: "Mark a coach flag as resolved so it stops showing. Ids come from get_athlete_context.",
      inputSchema: { flagId: z.string().uuid() },
    },
    async (a) => {
      const row = await resolveFlag(userId, a.flagId);
      return row ? ok(`Resolved: "${row.text}".`) : fail("Flag not found.");
    }
  );

  tool(
    "upsert_check_in",
    "write",
    {
      title: "Upsert check-in",
      description:
        "Record sleep / protein / water for a day when the athlete tells you instead of the app. Only the fields you pass change.",
      inputSchema: {
        date: isoDate.optional().describe("Defaults to today"),
        sleepMin: z.number().int().min(0).max(1440).optional(),
        proteinG: z.number().int().min(0).max(1000).optional(),
        waterMl: z.number().int().min(0).max(20000).optional(),
      },
    },
    async ({ date, ...patch }) => {
      const d = date ?? (await todayFor(userId));
      if (Object.keys(patch).length === 0) throw new DomainError("Pass at least one of sleepMin, proteinG, waterMl");
      const row = await upsertCheckIn(userId, d, patch, "claude");
      return ok(`Check-in for ${d} saved.`, {
        checkIn: { date: row.date, sleepMin: row.sleepMin, proteinG: row.proteinG, waterMl: row.waterMl, sources: row.sources },
      });
    }
  );

  // ------------------------------------------------------------- Resources

  server.registerResource(
    "lift-log",
    "liftlog://log/latest.md",
    {
      title: "Lift Log (full)",
      description: "The whole log rendered in the Obsidian Lift Log format, newest first.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const all = await exportSessions(userId, { limit: 500 });
      await recordToolCall({ userId, tool: "resource:latest.md", kind: "read", ok: true, summary: `${all.length} sessions`, clientId: caller.clientId });
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderLogMarkdown(all) }] };
    }
  );

  server.registerResource(
    "session-by-date",
    new ResourceTemplate("liftlog://session/{date}.md", {
      list: async () => {
        const recent = await exportSessions(userId, { limit: 20 });
        const dates = Array.from(new Set(recent.map((s) => s.date)));
        return {
          resources: dates.map((d) => ({
            uri: `liftlog://session/${d}.md`,
            name: sessionFileName(recent.find((s) => s.date === d)!),
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    {
      title: "Session by date",
      description: "One day's session(s) in the 'YYYY-MM-DD Session X.md' export format.",
      mimeType: "text/markdown",
    },
    async (uri, vars) => {
      const date = String(vars.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use liftlog://session/YYYY-MM-DD.md");
      const day = await exportSessions(userId, { date });
      const text = day.length ? day.map(renderSessionMarkdown).join("\n") : `No session logged on ${date}.\n`;
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  // ---------------------------------------------------------------- Prompt

  server.registerPrompt(
    "programme_next_session",
    {
      title: "Programme the next session",
      description:
        "Pull context and the last two sessions of the next type, apply the rules, draft a table, wait for approval, then push_plan.",
      argsSchema: {
        date: isoDate.optional().describe("YYYY-MM-DD, defaults to today"),
        sessionType: z.string().optional().describe("Override the rotation (one of the athlete's session letters)"),
      },
    },
    async (args) => {
      const [profile, today, cons] = await Promise.all([
        getProfile(userId),
        todayFor(userId),
        getConstraints(userId),
      ]);
      const date = args.date || today;
      const minSleepH = profile.targets.minSleepMin / 60;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Programme my next LiftLog session for ${date}${args.sessionType ? ` (Session ${args.sessionType})` : ""}.`,
                "",
                "1. Call get_athlete_context. Use rotation.nextDue unless I named a type.",
                `2. Call get_sessions with sessionType=<that type>, limit=2 (and from=${addDays(date, -60)}).`,
                "3. Call get_recovery. Gate 'hold': no load bumps, repeat last loads. Gate 'unknown': ask how I slept before adding any load.",
                "4. For each exercise, call get_exercise_history if you need the progression status.",
                "5. Apply the rules:",
                cons.length
                  ? "   - Never programme a blocked exercise; use its substitutes. Active constraints:"
                  : "   - Never programme a blocked exercise; use its substitutes. No injury constraints on file.",
                ...cons.map((c) => `     • ${c.region}: ${c.rule}`),
                "   - Upper compounds +2.5 kg, lower compounds +5 kg, only after 2 clean sessions at the top of the range; accessories add reps first.",
                "   - COUNTERWEIGHT machines: lower number = harder.",
                "   - PER_SIDE machines: openKg is true kg per side (plates + carriage).",
                "   - Compounds rest 180 s. Alternate chest with core; triceps go last, never paired with chest press.",
                "   - Open at last session's top set. Don't plan a light first set.",
                "6. Show me the plan as a table (exercise | sets × reps | open kg | RPE | rest | notes) with the coach notes.",
                `7. WAIT for my approval. Then call push_plan with clientRef \`pt-<date>-<type>\`, a recoveryGate of { minSleepH: ${minSleepH}, onFail: "hold_progression" }, and report any warnings.`,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

  return server;
}

