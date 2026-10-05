import { describe, expect, it } from "vitest";
import {
  annotateSets,
  estimatedOneRepMax,
  blockedReason,
  checkWeightJump,
  gateMessage,
  flagsForSet,
  holdMessage,
  matchesPattern,
  nextSessionType,
  plateBreakdown,
  platesFor,
  progressionStatus,
  renderSessionMarkdown,
  sessionFileName,
  summarizeRecovery,
  trueKg,
  underloadNudge,
  validatePlan,
  type DomainConstraint,
  type DomainExercise,
  type PlanInput,
  type ValidationContext,
} from "..";

// --- Fixtures taken from the real log ---------------------------------------

const ex = (e: Partial<DomainExercise> & Pick<DomainExercise, "id" | "name">): DomainExercise => ({
  category: "Arms",
  status: "YES",
  loadMode: "TOTAL",
  carriageKgPerSide: null,
  isCompound: false,
  bodyRegion: "upper",
  ...e,
});

const EX = {
  reverseCurl: ex({ id: "reverse-barbell-curl", name: "Reverse Barbell Curl" }),
  hammerCurl: ex({ id: "hammer-curl-db", name: "Hammer Curl (DB)" }),
  isoIncline: ex({
    id: "iso-incline-press",
    name: "Iso-Lateral Incline Press",
    category: "Upper Body — Push (Horizontal)",
    loadMode: "PER_SIDE",
    carriageKgPerSide: 3.6,
    isCompound: true,
  }),
  isoDecline: ex({
    id: "iso-decline-press",
    name: "Iso-Lateral Decline Press",
    category: "Upper Body — Push (Horizontal)",
    loadMode: "PER_SIDE",
    carriageKgPerSide: null,
    isCompound: true,
  }),
  pushdown: ex({ id: "rope-pushdown", name: "Rope Pushdown" }),
  crunch: ex({ id: "cable-crunch", name: "Cable Crunch", category: "Core" }),
  shoulderPress: ex({
    id: "machine-shoulder-press",
    name: "Machine Shoulder Press",
    category: "Upper Body — Push (Vertical)",
    isCompound: true,
  }),
  squat: ex({
    id: "machine-squat",
    name: "Machine Squat",
    category: "Lower Body — Quad Dominant",
    isCompound: true,
    bodyRegion: "lower",
  }),
  assistedPullup: ex({
    id: "assisted-pullup",
    name: "Assisted Pull-Up",
    category: "Upper Body — Pull (Vertical)",
    loadMode: "COUNTERWEIGHT",
    isCompound: true,
  }),
  deadlift: ex({
    id: "barbell-deadlift",
    name: "Barbell Deadlift",
    category: "Lower Body — Posterior Chain",
    isCompound: true,
    bodyRegion: "lower",
  }),
  latPulldown: ex({
    id: "lat-pulldown-wide",
    name: "Lat Pulldown (wide)",
    category: "Upper Body — Pull (Vertical)",
    isCompound: true,
  }),
};

const CONSTRAINTS: DomainConstraint[] = [
  {
    region: "Left wrist · TFCC",
    rule: "No loaded supination/pronation on a fixed straight bar",
    blockedPatterns: [
      "straight-bar curl",
      "reverse barbell curl",
      "straight-bar pushdown",
      "reverse-grip pushdown",
      "fixed straight-bar preacher",
      "barbell shrug",
      "flat-palm push-up",
    ],
  },
  {
    region: "Shoulder · impingement",
    rule: "No pressing behind the frontal plane",
    blockedPatterns: ["barbell OHP", "behind-the-neck press"],
  },
];

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    exercises: new Map(Object.values(EX).map((e) => [e.id, e])),
    constraints: CONSTRAINTS,
    lastTopSetKg: new Map([
      [EX.hammerCurl.id, 12.5],
      [EX.reverseCurl.id, 20],
      [EX.isoIncline.id, 21.1],
      [EX.isoDecline.id, 25],
      [EX.pushdown.id, 15],
      [EX.crunch.id, 30],
      [EX.shoulderPress.id, 35],
      [EX.squat.id, 50],
      [EX.assistedPullup.id, 47],
      [EX.deadlift.id, 80],
      [EX.latPulldown.id, 47],
    ]),
    sleepMinToday: 7 * 60,
    inProgressPlanExists: false,
    ...over,
  };
}

function plan(items: PlanInput["items"], over: Partial<PlanInput> = {}): PlanInput {
  return {
    clientRef: "pt-test",
    date: "2026-10-02",
    sessionType: "B",
    title: "Test",
    items,
    ...over,
  };
}

const working = (openKg: number, reps: [number, number] = [8, 10]) => ({
  type: "working" as const,
  reps,
  rpe: 8,
  openKg,
});

const codes = (r: { errors: { code: string }[]; warnings: { code: string }[] }) => ({
  errors: r.errors.map((i) => i.code),
  warnings: r.warnings.map((i) => i.code),
});

// --- True-load maths --------------------------------------------------------

describe("estimated 1RM", () => {
  it("uses Epley for stack and per-side loads", () => {
    expect(estimatedOneRepMax("TOTAL", 55, 8)).toBe(69.7);
    expect(estimatedOneRepMax("PER_SIDE", 20, 1)).toBe(20);
  });
  it("is undefined where lower is harder or work is timed", () => {
    expect(estimatedOneRepMax("COUNTERWEIGHT", 32.5, 8)).toBeNull();
    expect(estimatedOneRepMax("TIME", 0, 30)).toBeNull();
  });
});

describe("true load", () => {
  it("adds carriage per side for iso-lateral machines (17.5 + 3.6 = 21.1)", () => {
    expect(trueKg(EX.isoIncline, 17.5)).toBe(21.1);
    expect(platesFor(EX.isoIncline, 21.1)).toBe(17.5);
  });
  it("leaves total-load exercises alone", () => {
    expect(trueKg(EX.deadlift, 85)).toBe(85);
  });
});

describe("plate breakdown", () => {
  it("splits a barbell load per side after the 20 kg bar", () => {
    expect(plateBreakdown(EX.deadlift, 110)).toEqual({ plates: [25, 20], leftover: 0 });
    expect(plateBreakdown(EX.deadlift, 82.5)).toEqual({ plates: [25, 5, 1.25], leftover: 0 });
  });
  it("reports what standard plates can't make", () => {
    expect(plateBreakdown(EX.deadlift, 111)).toEqual({ plates: [25, 20], leftover: 1 });
  });
  it("loads per-side machines net of the carriage", () => {
    expect(plateBreakdown(EX.isoIncline, 21.1)).toEqual({ plates: [15, 2.5], leftover: 0 });
  });
  it("skips lifts that aren't plate-loaded", () => {
    expect(plateBreakdown({ ...EX.deadlift, name: "Lat Pulldown", equipment: "cable" }, 50)).toBeNull();
    expect(plateBreakdown({ ...EX.deadlift, name: "Dumbbell Romanian Deadlift", equipment: "dumbbell" }, 40)).toBeNull();
  });
  it("flags a target lighter than the empty bar", () => {
    expect(plateBreakdown(EX.deadlift, 15)).toEqual({ plates: [], leftover: -5 });
  });
});

// --- V1–V10 -----------------------------------------------------------------

describe("V1 blocked exercises", () => {
  it("blocks the 12/08 reverse barbell curl", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.reverseCurl.id, order: 1, restSec: 90, sets: [working(20)] }]),
      ctx()
    );
    expect(codes(r).errors).toContain("V1");
    expect(r.errors[0].message).toMatch(/Left wrist/);
  });
  it("lets an explicit overrideReason through", () => {
    const r = validatePlan(
      plan([
        {
          exerciseId: EX.reverseCurl.id,
          order: 1,
          restSec: 90,
          overrideReason: "Physio cleared it, 2 light sets",
          sets: [working(20)],
        },
      ]),
      ctx()
    );
    expect(codes(r).errors).not.toContain("V1");
  });
  it("blocks status NO even without a pattern", () => {
    const c = ctx();
    c.exercises.set("x", ex({ id: "x", name: "Sumo Deadlift", status: "NO" }));
    const r = validatePlan(plan([{ exerciseId: "x", order: 1, restSec: 180, sets: [] }]), c);
    expect(codes(r).errors).toContain("V1");
  });
  it("matches patterns across punctuation and plurals", () => {
    expect(matchesPattern("Barbell Curl (straight bar)", "straight-bar curl")).toBe(true);
    expect(matchesPattern("Barbell Shrugs", "barbell shrug")).toBe(true);
    expect(matchesPattern("Hammer Curl (DB)", "straight-bar curl")).toBe(false);
    expect(matchesPattern("Machine Shrugs", "barbell shrug")).toBe(false);
  });
});

describe("V2 chest/triceps alternation", () => {
  it("rejects the 13/08 incline press + pushdown superset", () => {
    const r = validatePlan(
      plan([
        { exerciseId: EX.isoIncline.id, order: 1, restSec: 180, pairGroup: "A", sets: [working(21.1)] },
        { exerciseId: EX.pushdown.id, order: 2, restSec: 90, pairGroup: "A", sets: [working(15)] },
      ]),
      ctx()
    );
    expect(codes(r).errors).toContain("V2");
  });
  it("allows chest alternated with core", () => {
    const r = validatePlan(
      plan([
        { exerciseId: EX.isoIncline.id, order: 1, restSec: 180, pairGroup: "A", sets: [working(21.1)] },
        { exerciseId: EX.crunch.id, order: 2, restSec: 60, pairGroup: "A", sets: [working(30)] },
      ]),
      ctx()
    );
    expect(codes(r).errors).not.toContain("V2");
  });
});

describe("V3 underloading", () => {
  it("warns on the 10/08 shoulder-press pattern (opening 15%+ light)", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.shoulderPress.id, order: 1, restSec: 180, sets: [working(20)] }]),
      ctx()
    );
    expect(codes(r).warnings).toContain("V3");
    expect(r.errors).toHaveLength(0);
  });
  it("is quiet when opening at last top", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.shoulderPress.id, order: 1, restSec: 180, sets: [working(35)] }]),
      ctx()
    );
    expect(codes(r).warnings).not.toContain("V3");
  });
  it("inverts for counterweight (higher cw = underloaded)", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.assistedPullup.id, order: 1, restSec: 180, sets: [working(60)] }]),
      ctx()
    );
    expect(codes(r).warnings).toContain("V3");
  });
});

describe("V4 recovery gate", () => {
  it("warns on a bump when sleep is under the gate", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.deadlift.id, order: 1, restSec: 180, sets: [working(85)] }], {
        recoveryGate: { minSleepH: 6, onFail: "hold_progression" },
      }),
      ctx({ sleepMinToday: 340 })
    );
    expect(codes(r).warnings).toContain("V4");
  });
  it("is quiet on a good night", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.deadlift.id, order: 1, restSec: 180, sets: [working(85)] }], {
        recoveryGate: { minSleepH: 6, onFail: "hold_progression" },
      }),
      ctx({ sleepMinToday: 420 })
    );
    expect(codes(r).warnings).not.toContain("V4");
  });
});

describe("V5 increments", () => {
  it("accepts +5 on a lower compound", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.deadlift.id, order: 1, restSec: 180, sets: [working(85)] }]),
      ctx()
    );
    expect(codes(r).warnings).not.toContain("V5");
  });
  it("flags +5 on an upper compound", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.shoulderPress.id, order: 1, restSec: 180, sets: [working(40)] }]),
      ctx()
    );
    expect(codes(r).warnings).toContain("V5");
  });
  it("flags load bumps on accessories (reps first)", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.hammerCurl.id, order: 1, restSec: 90, sets: [working(15)] }]),
      ctx()
    );
    expect(codes(r).warnings).toContain("V5");
  });
});

describe("V6 compound rest", () => {
  it("warns under 150 s on a compound", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.deadlift.id, order: 1, restSec: 90, sets: [working(80)] }]),
      ctx()
    );
    expect(codes(r).warnings).toContain("V6");
  });
});

describe("V7 carriage calibration", () => {
  it("warns for a per-side machine with no carriage", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.isoDecline.id, order: 1, restSec: 180, sets: [working(25)] }]),
      ctx()
    );
    expect(codes(r).warnings).toContain("V7");
  });
});

describe("V8 counterweight direction", () => {
  it("rejects a higher counterweight sold as progress", () => {
    const r = validatePlan(
      plan([
        {
          exerciseId: EX.assistedPullup.id,
          order: 1,
          restSec: 150,
          progression: "increase",
          sets: [working(52)],
        },
      ]),
      ctx()
    );
    expect(codes(r).errors).toContain("V8");
  });
  it("accepts a lower counterweight as progress", () => {
    const r = validatePlan(
      plan([
        {
          exerciseId: EX.assistedPullup.id,
          order: 1,
          restSec: 180,
          progression: "increase",
          sets: [working(44.5)],
        },
      ]),
      ctx()
    );
    expect(codes(r).errors).toHaveLength(0);
  });
});

describe("V9 no history", () => {
  it("asks for a calibration weight", () => {
    const c = ctx();
    c.lastTopSetKg.delete(EX.hammerCurl.id);
    const r = validatePlan(
      plan([{ exerciseId: EX.hammerCurl.id, order: 1, restSec: 90, sets: [working(12.5)] }]),
      c
    );
    expect(codes(r).warnings).toContain("V9");
  });
});

describe("V10 in-progress plan", () => {
  it("blocks pushing over a session that's under way", () => {
    const r = validatePlan(plan([]), ctx({ inProgressPlanExists: true }));
    expect(codes(r).errors).toContain("V10");
  });
});

describe("spec example payload", () => {
  it("passes with only warnings", () => {
    const r = validatePlan(
      plan(
        [
          {
            exerciseId: EX.assistedPullup.id,
            order: 1,
            restSec: 150,
            sets: [working(47, [6, 10]), working(47, [6, 10]), working(47, [6, 10])],
          },
          {
            exerciseId: EX.deadlift.id,
            order: 2,
            restSec: 180,
            straps: true,
            sets: [
              { type: "warmup", reps: [8, 8], openKg: 60 },
              working(75, [5, 8]),
              { type: "working", reps: [5, 5], rpe: 8.5, openKg: 85 },
            ],
          },
        ],
        { recoveryGate: { minSleepH: 6, onFail: "hold_progression" } }
      ),
      ctx()
    );
    expect(r.errors).toHaveLength(0);
  });
});

// --- Working-weight jumps ---------------------------------------------------

describe("update_working_weight jump guard", () => {
  it("rejects the 17/08 squat jump 50 → 90", () => {
    const c = checkWeightJump(EX.squat, 50, 90);
    expect(c.ok).toBe(false);
    expect(c.increments).toBe(8);
  });
  it("allows two increments", () => {
    expect(checkWeightJump(EX.squat, 50, 60).ok).toBe(true);
    expect(checkWeightJump(EX.shoulderPress, 35, 40).ok).toBe(true);
    expect(checkWeightJump(EX.shoulderPress, 35, 42.5).ok).toBe(false);
  });
});

// --- Progression ------------------------------------------------------------

describe("progression status", () => {
  it("shows 1 of 2 after one clean session at 35 × 10", () => {
    const s = progressionStatus(EX.shoulderPress, [
      {
        date: "2026-08-17",
        sets: [
          { weight: 27.5, reps: 12, rpe: 7 },
          { weight: 35, reps: 10, rpe: 8 },
          { weight: 35, reps: 8, rpe: 8.5 },
        ],
      },
      { date: "2026-08-10", sets: [{ weight: 20, reps: 15, rpe: 6 }] },
    ]);
    expect(s.workingKg).toBe(35);
    expect(s.label).toBe("1 of 2");
    expect(s.nextKg).toBe(37.5);
    expect(s.ready).toBe(false);
  });
  it("is ready after two, and held on short sleep", () => {
    const history = [
      { date: "b", sets: [{ weight: 35, reps: 10, rpe: 8 }] },
      { date: "a", sets: [{ weight: 35, reps: 10, rpe: 8 }] },
    ];
    expect(progressionStatus(EX.shoulderPress, history).ready).toBe(true);
    expect(
      progressionStatus(EX.shoulderPress, history, { sleepGateFails: true }).ready
    ).toBe(false);
  });
  it("progresses counterweight downward", () => {
    const history = [
      { date: "b", sets: [{ weight: 47, reps: 10, rpe: 8 }] },
      { date: "a", sets: [{ weight: 47, reps: 10, rpe: 8 }] },
    ];
    expect(progressionStatus(EX.assistedPullup, history).nextKg).toBe(44.5);
  });
});

// --- Live nudge + flags -----------------------------------------------------

describe("live underload nudge", () => {
  it("catches lat pulldown 40 × 15 @ 6 against a 47 open", () => {
    const n = underloadNudge(
      EX.latPulldown,
      { weight: 40, reps: 15, rpe: 6 },
      working(47),
      47
    );
    expect(n?.suggestKg).toBe(47);
    expect(n?.headline).toBe("15 reps at RPE 6 is a warm-up.");
    expect(n?.detail).toBe("You opened 7 kg under target.");
  });
  it("stays quiet on a real working set", () => {
    expect(
      underloadNudge(EX.latPulldown, { weight: 47, reps: 8, rpe: 8 }, working(47), 47)
    ).toBeNull();
  });
  it("flags PRs and underloads", () => {
    expect(flagsForSet(EX.deadlift, { weight: 85, type: "working" }, 80)).toEqual(["top_set_pr"]);
    expect(flagsForSet(EX.latPulldown, { weight: 38, type: "working" }, 47)).toEqual(["underloaded"]);
    expect(flagsForSet(EX.latPulldown, { weight: 38, type: "warmup" }, 47)).toEqual([]);
  });
});

// --- Recovery + rotation ----------------------------------------------------

describe("recovery", () => {
  it("counts the short-sleep streak and holds progression", () => {
    const s = summarizeRecovery(
      [340, 330, 350, 300, 345, 420].map((sleepMin, i) => ({
        date: `d${i}`,
        sleepMin,
        proteinG: 120,
        waterMl: 2000,
      }))
    );
    expect(s.shortSleepStreak).toBe(5);
    expect(s.progressionOnHold).toBe(true);
    expect(holdMessage(s)).toMatch(/5th short night/);
  });
});

describe("rotation", () => {
  it("cycles A → B → C → A and skips cardio", () => {
    expect(nextSessionType([])).toBe("A");
    expect(nextSessionType(["A"])).toBe("B");
    expect(nextSessionType(["Cardio", "B"])).toBe("C");
    expect(nextSessionType(["C"])).toBe("A");
  });
});

// --- Export -----------------------------------------------------------------

describe("markdown export", () => {
  it("renders the Lift Log entry", () => {
    const md = renderSessionMarkdown({
      date: "2026-10-02",
      sessionType: "B",
      title: "Back & Biceps",
      exercises: [
        {
          name: "Barbell Deadlift",
          loadMode: "TOTAL",
          straps: true,
          sets: [
            { weight: 75, reps: 8, rpe: 8 },
            { weight: 85, reps: 5, rpe: 8.5, flags: ["top_set_pr"] },
            { weight: 85, reps: 5, rpe: 8.5 },
          ],
        },
        {
          name: "Assisted Pull-Up",
          loadMode: "COUNTERWEIGHT",
          sets: [
            { weight: 47, reps: 8, rpe: 8 },
            { weight: 47, reps: 7, rpe: 8 },
          ],
        },
      ],
      checkIn: { sleepMin: 340, proteinG: 42, waterMl: 1200 },
      notes: "Grip held with straps.",
    });
    expect(md).toContain("## 02/10/2026 — Session B: Back & Biceps");
    expect(md).toContain("| Barbell Deadlift | 8, 5, 5 | 75/85/85 | 8.5 | Straps. Top set ↑ |");
    expect(md).toContain("| Assisted Pull-Up | 8, 7 | 47 cw | 8 |  |");
    expect(md).toContain("Sleep 5:40 · Protein 42/155 g · Water 1.2/3.5 L");
    expect(sessionFileName({ date: "2026-10-02", sessionType: "B", title: "x" })).toBe(
      "2026-10-02 Session B.md"
    );
  });
});

// --- Fixes from the first week of real use ------------------------------------

const sets = (rows: Array<[number, number, number?]>) =>
  rows.map(([weight, reps, rpe]) => ({ weight, reps, rpe: rpe ?? null, type: "working" as const }));
const underloadedIdx = (xs: { flags?: string[] }[]) =>
  xs.flatMap((x, i) => (x.flags?.includes("underloaded") ? [i] : []));

describe("annotateSets — underloaded openers in the session itself", () => {
  it("flags the 12/08 openers: pull-ups 54×10, lat pulldown 40×13, preacher 23×12", () => {
    expect(underloadedIdx(annotateSets(EX.assistedPullup, sets([[54, 10], [47, 6], [47, 5, 8]]), null))).toEqual([0]);
    expect(underloadedIdx(annotateSets(EX.latPulldown, sets([[40, 13], [47, 8], [47, 8, 8]]), null))).toEqual([0]);
    const preacher = ex({ id: "preacher", name: "Preacher Curl (rotating handles)" });
    expect(underloadedIdx(annotateSets(preacher, sets([[23, 12], [30, 6], [30, 5, 9]]), null))).toEqual([0]);
  });
  it("leaves barbell ramp-ups alone (deadlift 60/70/80)", () => {
    const dl = { ...EX.deadlift, equipment: "barbell" };
    expect(underloadedIdx(annotateSets(dl, sets([[60, 12], [70, 10], [80, 5, 8]]), null))).toEqual([]);
  });
  it("doesn't flag a normal pyramid (17/08 shoulder press 27.5×12 → 35×10)", () => {
    expect(underloadedIdx(annotateSets(EX.shoulderPress, sets([[27.5, 12], [35, 10], [35, 8]]), 20))).toEqual([]);
  });
  it("flags every set when the hardest set was RPE 6 (10/08 shoulder press)", () => {
    expect(underloadedIdx(annotateSets(EX.shoulderPress, sets([[20, 15], [20, 15], [20, 12, 6]]), null))).toEqual([0, 1, 2]);
  });
  it("keeps blocked_override and marks PRs against the previous session", () => {
    const out = annotateSets(EX.deadlift, [{ weight: 85, reps: 5, type: "working", flags: ["blocked_override"] }], 80);
    expect(out[0].flags).toEqual(["top_set_pr", "blocked_override"]);
  });
  it("never calls an underloaded opener a PR (17/08 lateral raise 27.5×15 → 39×9)", () => {
    const lat = ex({ id: "lat-raise", name: "Machine Lateral Raise" });
    const out = annotateSets(lat, sets([[27.5, 15], [32, 12], [39, 9]]), 25);
    expect(out.map((s) => s.flags)).toEqual([["underloaded"], ["underloaded"], ["top_set_pr"]]);
  });
});

describe("recovery gate", () => {
  it("is unknown — not clear — when today's sleep isn't logged", () => {
    const s = summarizeRecovery([]);
    expect(s.gate).toBe("unknown");
    expect(s.progressionOnHold).toBe(false);
    expect(gateMessage(s)).toMatch(/ask/i);
  });
  it("is clear or hold when it is logged", () => {
    const d = (sleepMin: number) => [{ date: "d", sleepMin, proteinG: null, waterMl: null }];
    expect(summarizeRecovery(d(420)).gate).toBe("clear");
    expect(summarizeRecovery(d(300)).gate).toBe("hold");
  });
  it("V4 warns on a bump when sleep isn't logged", () => {
    const r = validatePlan(
      plan([{ exerciseId: EX.deadlift.id, order: 1, restSec: 180, sets: [working(85)] }], {
        recoveryGate: { minSleepH: 6, onFail: "hold_progression" },
      }),
      ctx({ sleepMinToday: null })
    );
    expect(codes(r).warnings).toContain("V4");
    expect(r.warnings.find((w) => w.code === "V4")?.message).toMatch(/isn't logged/);
  });
  it("progression waits on unknown sleep", () => {
    const history = [
      { date: "b", sets: [{ weight: 35, reps: 10, rpe: 8 }] },
      { date: "a", sets: [{ weight: 35, reps: 10, rpe: 8 }] },
    ];
    const p = progressionStatus(EX.shoulderPress, history, { sleepUnknown: true });
    expect(p.ready).toBe(false);
    expect(p.summary).toMatch(/ask before bumping/i);
  });
});

describe("lumbar constraint covers deadlifts in any session", () => {
  const lumbar: DomainConstraint = {
    region: "Lower back · lumbar irritation",
    rule: "No loaded spinal hinging in any session until symptom-free",
    blockedPatterns: ["deadlift", "rdl", "good morning", "bent over row", "pendlay row", "back extension", "hyperextension"],
  };
  it("blocks barbell and RDL variants, not leg curls or hip thrusts", () => {
    const blocked = (name: string) => blockedReason(ex({ id: name, name }), [lumbar]) != null;
    expect(blocked("Barbell Deadlift")).toBe(true);
    expect(blocked("Conventional Deadlift")).toBe(true);
    expect(blocked("DB Romanian Deadlift")).toBe(true);
    expect(blocked("Barbell Bent Over Row")).toBe(true);
    expect(blocked("Pendlay Row")).toBe(true);
    expect(blocked("Sumo Deadlift")).toBe(true);
    expect(blocked("Leg Curl (lying)")).toBe(false);
    expect(blocked("Seated Cable Row")).toBe(false);
    expect(blocked("Overhead Tricep extension - Dumbbell")).toBe(false);
    expect(blocked("Hip Thrust (barbell)")).toBe(false);
  });
});

describe("cardio (TIME) exercises", () => {
  const walk = ex({
    id: "incline-treadmill-walk",
    name: "Incline Treadmill Walk",
    category: "Cardio",
    loadMode: "TIME",
    bodyRegion: "lower",
  });
  it("validates a Zone 2 plan with no load warnings", () => {
    const c = ctx();
    c.exercises.set(walk.id, walk);
    const r = validatePlan(
      plan([
        {
          exerciseId: walk.id,
          order: 1,
          restSec: 0,
          cues: ["Flat 5 min", "HR 130–140, incline is the only lever"],
          sets: [
            { type: "warmup", reps: [5, 5] },
            { type: "working", reps: [35, 35] },
          ],
        },
      ], { sessionType: "Cardio", recoveryGate: { minSleepH: 6, onFail: "hold_progression" } }),
      { ...c, sleepMinToday: null }
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it("never flags minutes, and exports them as minutes", () => {
    const out = annotateSets(walk, [{ weight: 0, reps: 35, type: "working", avgHr: 134 }], null);
    expect(out[0].flags).toEqual([]);
    const md = renderSessionMarkdown({
      date: "2026-10-02",
      sessionType: "Cardio",
      title: "Zone 2",
      exercises: [{ name: walk.name, loadMode: "TIME", sets: out }],
    });
    expect(md).toContain("| Incline Treadmill Walk | 35 min | avg HR 134 |");
  });
});
