import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  foodLogItems,
  foodLogs,
  foods,
  labAppointments,
  labResults,
  supplementInventory,
  supplementLogs,
  supplements,
  timingRules,
  type SupplementRow,
  type SupplementSlot,
} from "@/lib/db/schema";
import { addDays, isoDateInTz, localToUtc } from "@/lib/dates";
import {
  checkTiming,
  daysLeft,
  effectiveRules,
  isScheduled,
  labChecklist,
  MARKERS,
  REFILL_WARN_DAYS,
  retestDue,
  servingsLeft,
  SLOTS,
  type ChecklistItem,
  type Nudge,
  type TimingEvent,
} from "@/domain/supplements";
import { DomainError } from "./errors";
import { getProfile, todayFor } from "./profile";
import { createLog, deleteLog } from "./food/logs";
import { sendPushToUser } from "./push";

// --- Stack -------------------------------------------------------------------------

export interface StackItem extends SupplementRow {
  servingsLeft: number | null;
  daysLeft: number | null;
  lowStock: boolean;
}

export async function listStack(userId: string): Promise<StackItem[]> {
  const rows = await db
    .select()
    .from(supplements)
    .where(and(eq(supplements.userId, userId), isNull(supplements.archivedAt)))
    .orderBy(asc(supplements.position), asc(supplements.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [inv, doses] = await Promise.all([
    db.select().from(supplementInventory).where(inArray(supplementInventory.supplementId, ids)),
    db
      .select({ id: supplementLogs.supplementId, at: supplementLogs.takenAt, m: supplementLogs.doseMultiplier })
      .from(supplementLogs)
      .where(and(inArray(supplementLogs.supplementId, ids), sql`${supplementLogs.doseMultiplier} > 0`)),
  ]);
  return rows.map((r) => {
    const left = servingsLeft([
      ...inv.filter((e) => e.supplementId === r.id).map((e) => ({ at: e.at.getTime(), kind: e.kind, servings: e.servings })),
      ...doses.filter((d) => d.id === r.id).map((d) => ({ at: d.at.getTime(), kind: "dose" as const, servings: d.m * r.servingsPerDose })),
    ]);
    const days = daysLeft(left, r.servingsPerDose, r.activeDays);
    return { ...r, servingsLeft: left, daysLeft: days, lowStock: days !== null && days < REFILL_WARN_DAYS };
  });
}

export interface SupplementInput {
  name: string;
  brand?: string | null;
  form?: SupplementRow["form"];
  servingDesc?: string;
  servingsPerDose?: number;
  servingsPerContainer?: number | null;
  slot: SupplementSlot;
  activeDays?: number[];
  tags?: string[];
  markers?: string[];
  foodId?: string | null;
  foodGramsPerServing?: number | null;
  whereToBuy?: Array<{ region: string; note: string }>;
  notes?: string | null;
}

function clean(input: SupplementInput) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new DomainError("Give it a name.");
  if (!SLOTS.some((s) => s.slot === input.slot)) throw new DomainError("Pick when you take it.");
  const days = [...new Set((input.activeDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const perDose = input.servingsPerDose ?? 1;
  if (!(perDose > 0 && perDose <= 20)) throw new DomainError("Servings per dose must be between 0 and 20.");
  if (input.foodId && !(input.foodGramsPerServing && input.foodGramsPerServing > 0)) {
    throw new DomainError("A supplement that logs food needs the grams per serving (e.g. 31 g per scoop).");
  }
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean))].slice(0, 15);
  const markers = [...new Set((input.markers ?? []).filter((m) => m in MARKERS))];
  return {
    name,
    brand: input.brand?.trim() || null,
    form: input.form ?? "tablet",
    servingDesc: input.servingDesc?.trim() || "1 serving",
    servingsPerDose: perDose,
    servingsPerContainer: input.servingsPerContainer ?? null,
    slot: input.slot,
    activeDays: days.length === 7 ? [] : days,
    tags,
    markers,
    foodId: input.foodId ?? null,
    foodGramsPerServing: input.foodId ? input.foodGramsPerServing! : null,
    whereToBuy: (input.whereToBuy ?? []).filter((w) => w.region.trim()).slice(0, 5),
    notes: input.notes?.trim() || null,
  };
}

export async function addSupplement(userId: string, input: SupplementInput): Promise<string> {
  const v = clean(input);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(supplements).where(eq(supplements.userId, userId));
  const [row] = await db.insert(supplements).values({ userId, ...v, position: n }).returning({ id: supplements.id });
  return row.id;
}

export async function updateSupplement(userId: string, id: string, input: SupplementInput): Promise<void> {
  const res = await db
    .update(supplements)
    .set({ ...clean(input), updatedAt: new Date() })
    .where(and(eq(supplements.id, id), eq(supplements.userId, userId)))
    .returning({ id: supplements.id });
  if (!res.length) throw new DomainError("That supplement doesn't exist.");
}

export async function archiveSupplement(userId: string, id: string): Promise<void> {
  await db.update(supplements).set({ archivedAt: new Date() }).where(and(eq(supplements.id, id), eq(supplements.userId, userId)));
}

export async function addInventory(
  userId: string,
  supplementId: string,
  input: { servings: number; kind: "restock" | "count"; region?: string | null; note?: string | null }
): Promise<void> {
  if (!(input.servings >= 0 && input.servings <= 10_000)) throw new DomainError("Servings must be between 0 and 10,000.");
  const [s] = await db.select({ id: supplements.id }).from(supplements).where(and(eq(supplements.id, supplementId), eq(supplements.userId, userId)));
  if (!s) throw new DomainError("That supplement doesn't exist.");
  await db.insert(supplementInventory).values({ userId, supplementId, servings: input.servings, kind: input.kind, region: input.region ?? null, note: input.note ?? null });
}

// --- Today ------------------------------------------------------------------------

export interface SlotItem {
  supplement: StackItem;
  status: "pending" | "taken" | "half" | "skipped";
  late: boolean;
  takenAt: string | null;
  /** 1 = a normal dose, 2 = ×2, 0.5 = half; null until logged. */
  multiplier: number | null;
}

export interface TodaySlots {
  date: string;
  slots: Array<{ slot: SupplementSlot; label: string; items: SlotItem[] }>;
  lowStock: StackItem[];
}

export async function todaySlots(userId: string, date?: string): Promise<TodaySlots> {
  date ??= await todayFor(userId);
  const stack = await listStack(userId);
  const logs = await db
    .select()
    .from(supplementLogs)
    .where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.localDate, date)));
  const slots = SLOTS.map(({ slot, label }) => ({
    slot,
    label,
    items: stack
      .filter((s) => s.slot === slot && isScheduled(s.activeDays, date!))
      .map((s): SlotItem => {
        const l = logs.find((x) => x.supplementId === s.id);
        return { supplement: s, status: l ? l.status : "pending", late: l?.late ?? false, takenAt: l?.takenAt.toISOString() ?? null, multiplier: l ? Number(l.doseMultiplier) : null };
      }),
  })).filter((s) => s.items.length);
  return { date, slots, lowStock: stack.filter((s) => s.lowStock) };
}

/** Whey and collagen: a dose logs its food too, so kcal and protein land in the food log. */
async function logDoseFood(userId: string, s: SupplementRow, multiplier: number, at: Date): Promise<string | null> {
  if (!s.foodId || !s.foodGramsPerServing || multiplier <= 0) return null;
  const grams = Math.round(s.foodGramsPerServing * s.servingsPerDose * multiplier * 10) / 10;
  const r = await createLog(userId, { inputMode: "supplement", eatenAt: at, items: [{ foodId: s.foodId, grams }] });
  return r.id;
}

/**
 * Record one supplement for a day: taken (×multiplier), half, or skipped.
 * Re-recording replaces the day's entry, including its food log.
 */
export async function setDose(
  userId: string,
  supplementId: string,
  opts: { date?: string; status: "taken" | "half" | "skipped"; multiplier?: number; late?: boolean; at?: Date }
): Promise<{ nudges: Nudge[] }> {
  const [s] = await db.select().from(supplements).where(and(eq(supplements.id, supplementId), eq(supplements.userId, userId)));
  if (!s) throw new DomainError("That supplement doesn't exist.");
  const { timezone: tz } = await getProfile(userId);
  if (opts.at) {
    if (opts.at.getTime() > Date.now() + 2 * 60_000) throw new DomainError("That time hasn't happened yet.");
    if (opts.date && isoDateInTz(opts.at, tz) !== opts.date) throw new DomainError("Pick a time on the same day.");
  }
  const at = opts.at ?? (opts.date && opts.date !== (await todayFor(userId)) ? localToUtc(opts.date, SLOTS.find((x) => x.slot === s.slot)!.time, tz) : new Date());
  const date = opts.date ?? isoDateInTz(at, tz);
  const multiplier = opts.status === "skipped" ? 0 : opts.status === "half" ? 0.5 : Math.min(5, Math.max(0.25, opts.multiplier ?? 1));

  const [prev] = await db
    .select()
    .from(supplementLogs)
    .where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.supplementId, supplementId), eq(supplementLogs.localDate, date)));
  if (prev?.foodLogId) await deleteLog(userId, prev.foodLogId).catch(() => {});
  const foodLogId = await logDoseFood(userId, s, multiplier, at);
  const values = { takenAt: at, tz, status: opts.status, doseMultiplier: multiplier, late: !!opts.late, foodLogId };
  let id: string;
  if (prev) {
    await db.update(supplementLogs).set(values).where(eq(supplementLogs.id, prev.id));
    id = prev.id;
  } else {
    [{ id }] = await db.insert(supplementLogs).values({ userId, supplementId, localDate: date, ...values }).returning({ id: supplementLogs.id });
  }
  return { nudges: multiplier > 0 ? await nudgesFor(userId, [`s:${id}`], at) : [] };
}

/** One tap: everything due in a slot that isn't logged yet, as taken. */
export async function takeSlot(userId: string, slot: SupplementSlot, date?: string, at?: Date): Promise<{ logged: number; nudges: Nudge[] }> {
  const today = await todaySlots(userId, date);
  const pending = today.slots.find((s) => s.slot === slot)?.items.filter((i) => i.status === "pending") ?? [];
  const nudges: Nudge[] = [];
  for (const i of pending) {
    const r = await setDose(userId, i.supplement.id, { date: today.date, status: "taken", at });
    nudges.push(...r.nudges);
  }
  const seen = new Set<string>();
  return { logged: pending.length, nudges: nudges.filter((n) => !seen.has(n.ruleKey + n.subject + n.object) && seen.add(n.ruleKey + n.subject + n.object)) };
}

/** Undo a day's entry for a supplement (and its food log). */
export async function clearDose(userId: string, supplementId: string, date: string): Promise<void> {
  const [prev] = await db
    .select()
    .from(supplementLogs)
    .where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.supplementId, supplementId), eq(supplementLogs.localDate, date)));
  if (!prev) return;
  if (prev.foodLogId) await deleteLog(userId, prev.foodLogId).catch(() => {});
  await db.delete(supplementLogs).where(eq(supplementLogs.id, prev.id));
}

// --- Timing -------------------------------------------------------------------------

async function rulesFor(userId: string) {
  const rows = await db
    .select()
    .from(timingRules)
    .where(or(isNull(timingRules.userId), eq(timingRules.userId, userId)));
  return effectiveRules(rows);
}

/** Supplements and meals within ±8 h of `around`, as timing events. */
async function timingEvents(userId: string, around: Date): Promise<TimingEvent[]> {
  const from = new Date(around.getTime() - 8 * 3_600_000);
  const to = new Date(around.getTime() + 8 * 3_600_000);
  const [doses, meals] = await Promise.all([
    db
      .select({ id: supplementLogs.id, at: supplementLogs.takenAt, name: supplements.name, tags: supplements.tags })
      .from(supplementLogs)
      .innerJoin(supplements, eq(supplements.id, supplementLogs.supplementId))
      .where(
        and(
          eq(supplementLogs.userId, userId),
          gte(supplementLogs.takenAt, from),
          lte(supplementLogs.takenAt, to),
          sql`${supplementLogs.doseMultiplier} > 0`
        )
      ),
    db
      .select({ id: foodLogs.id, at: foodLogs.eatenAt, name: foodLogItems.name, tags: foods.tags, aliases: foods.aliases })
      .from(foodLogs)
      .innerJoin(foodLogItems, eq(foodLogItems.logId, foodLogs.id))
      .leftJoin(foods, eq(foods.id, foodLogItems.foodId))
      .where(and(eq(foodLogs.userId, userId), gte(foodLogs.eatenAt, from), lte(foodLogs.eatenAt, to))),
  ]);
  const events: TimingEvent[] = doses.map((d) => ({ id: `s:${d.id}`, at: d.at.getTime(), tags: d.tags, label: d.name }));
  const byLog = new Map<string, TimingEvent>();
  for (const m of meals) {
    const e = byLog.get(m.id) ?? { id: `f:${m.id}`, at: m.at.getTime(), tags: ["food"], label: "", labels: {} };
    // Short names: "coffee", not "Beverages, coffee, brewed, prepared with tap water".
    const short = m.aliases?.[0] ?? m.name.split(",")[0];
    e.tags = [...new Set([...e.tags, ...(m.tags ?? [])])];
    for (const t of m.tags ?? []) e.labels![t] ??= short;
    e.label = e.label ? `${e.label} + ${short}` : short;
    byLog.set(m.id, e);
  }
  return [...events, ...byLog.values()];
}

/** Nudges for events just recorded (`ids` are "s:<supplement log>" or "f:<food log>"). */
export async function nudgesFor(userId: string, ids: string[], around: Date): Promise<Nudge[]> {
  const [rules, events] = await Promise.all([rulesFor(userId), timingEvents(userId, around)]);
  const added = events.filter((e) => ids.includes(e.id));
  return checkTiming(rules, added, events);
}

export async function listRules(userId: string) {
  return rulesFor(userId);
}

// --- Labs ---------------------------------------------------------------------------

export async function addLabResult(
  userId: string,
  r: { drawnOn: string; marker: string; value: number; unit?: string; refLow?: number | null; refHigh?: number | null; lab?: string | null; note?: string | null }
): Promise<void> {
  const info = MARKERS[r.marker];
  if (!info) throw new DomainError("Unknown marker.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.drawnOn)) throw new DomainError("Pick the date of the test.");
  if (!Number.isFinite(r.value) || r.value < 0) throw new DomainError("Enter the result as a number.");
  const values = { value: r.value, unit: r.unit?.trim() || info.unit, refLow: r.refLow ?? null, refHigh: r.refHigh ?? null, lab: r.lab ?? null, note: r.note ?? null };
  await db
    .insert(labResults)
    .values({ userId, drawnOn: r.drawnOn, marker: r.marker, ...values })
    .onConflictDoUpdate({ target: [labResults.userId, labResults.drawnOn, labResults.marker], set: values });
}

export async function deleteLabResult(userId: string, id: string): Promise<void> {
  await db.delete(labResults).where(and(eq(labResults.id, id), eq(labResults.userId, userId)));
}

export interface MarkerSummary {
  marker: string;
  label: string;
  unit: string;
  results: Array<{ id: string; drawnOn: string; value: number; unit: string; refLow: number | null; refHigh: number | null }>;
  due: string | null;
  supplements: string[];
}

export async function labSummary(userId: string): Promise<MarkerSummary[]> {
  const [rows, stack] = await Promise.all([
    db.select().from(labResults).where(eq(labResults.userId, userId)).orderBy(asc(labResults.drawnOn)),
    listStack(userId),
  ]);
  const markers = new Set([...rows.map((r) => r.marker), ...stack.flatMap((s) => s.markers)]);
  return [...markers]
    .filter((m) => MARKERS[m])
    .map((m) => {
      const results = rows.filter((r) => r.marker === m).map((r) => ({ id: r.id, drawnOn: r.drawnOn, value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh }));
      return {
        marker: m,
        label: MARKERS[m].label,
        unit: MARKERS[m].unit,
        results,
        due: retestDue(m, results.at(-1)?.drawnOn ?? null),
        supplements: stack.filter((s) => s.markers.includes(m)).map((s) => s.name),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function addAppointment(
  userId: string,
  a: { date: string; time: string; markers: string[]; fasting: boolean; note?: string | null; thyroidMedInstruction?: string | null }
): Promise<string> {
  const { timezone: tz } = await getProfile(userId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^\d{2}:\d{2}$/.test(a.time)) throw new DomainError("Pick the date and time of the test.");
  const markers = a.markers.filter((m) => m in MARKERS);
  if (!markers.length) throw new DomainError("Pick at least one test.");
  const [row] = await db
    .insert(labAppointments)
    .values({ userId, scheduledAt: localToUtc(a.date, a.time, tz), tz, markers, fasting: a.fasting, note: a.note ?? null, thyroidMedInstruction: a.thyroidMedInstruction ?? null })
    .returning({ id: labAppointments.id });
  return row.id;
}

export async function deleteAppointment(userId: string, id: string): Promise<void> {
  await db.delete(labAppointments).where(and(eq(labAppointments.id, id), eq(labAppointments.userId, userId)));
}

export interface UpcomingAppointment {
  id: string;
  scheduledAt: string;
  markers: string[];
  fasting: boolean;
  note: string | null;
  thyroidMedInstruction: string | null;
  checklist: Array<Omit<ChecklistItem, "from"> & { from: string }>;
}

export async function upcomingAppointments(userId: string): Promise<UpcomingAppointment[]> {
  const [rows, stack] = await Promise.all([
    db
      .select()
      .from(labAppointments)
      .where(and(eq(labAppointments.userId, userId), gte(labAppointments.scheduledAt, new Date(Date.now() - 6 * 3_600_000))))
      .orderBy(asc(labAppointments.scheduledAt)),
    listStack(userId),
  ]);
  return rows.map((a) => ({
    id: a.id,
    scheduledAt: a.scheduledAt.toISOString(),
    markers: a.markers,
    fasting: a.fasting,
    note: a.note,
    thyroidMedInstruction: a.thyroidMedInstruction,
    checklist: labChecklist(
      { at: a.scheduledAt.getTime(), markers: a.markers, fasting: a.fasting, thyroidMedInstruction: a.thyroidMedInstruction },
      stack.map((s) => ({ name: s.name, tags: s.tags }))
    ).map((c) => ({ ...c, from: new Date(c.from).toISOString() })),
  }));
}

// --- Daily reminders (cron) ----------------------------------------------------------

/**
 * Once a day: refill reminders when something has under 10 days left, and
 * checklist reminders for a blood test in the next 4 days. One push, only
 * when there's something to say.
 */
export async function dailySupplementReminders(userId: string): Promise<boolean> {
  const [stack, appts] = await Promise.all([listStack(userId), upcomingAppointments(userId)]);
  const low = stack.filter((s) => s.lowStock);
  const soon = appts.filter((a) => Date.parse(a.scheduledAt) - Date.now() < 4 * 86_400_000);
  const lines = [
    ...low.map((s) => `${s.name}: about ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left${s.whereToBuy[0] ? ` (${s.whereToBuy.map((w) => w.region).join("/")})` : ""}`),
    ...soon.flatMap((a) => a.checklist.filter((c) => Date.parse(c.from) <= Date.now() + 86_400_000).map((c) => c.text.split(":")[0])),
  ];
  if (!lines.length) return false;
  await sendPushToUser(userId, {
    title: low.length ? "Running low" : "Blood test coming up",
    body: lines.slice(0, 3).join(" · "),
    url: "/supplements",
    tag: "supplements-daily",
  });
  return true;
}

export async function supplementUserIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ userId: supplements.userId }).from(supplements).where(isNull(supplements.archivedAt));
  return rows.map((r) => r.userId);
}

/** Adherence for a range: per supplement, scheduled vs taken days. Data, not a score. */
export async function adherence(userId: string, from: string, to: string) {
  const [stack, logs] = await Promise.all([
    listStack(userId),
    db
      .select()
      .from(supplementLogs)
      .where(and(eq(supplementLogs.userId, userId), gte(supplementLogs.localDate, from), lte(supplementLogs.localDate, to)))
      .orderBy(desc(supplementLogs.localDate)),
  ]);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return stack.map((s) => {
    const scheduled = days.filter((d) => isScheduled(s.activeDays, d));
    const mine = logs.filter((l) => l.supplementId === s.id);
    return {
      id: s.id,
      name: s.name,
      scheduled: scheduled.length,
      taken: mine.filter((l) => l.status === "taken").length,
      half: mine.filter((l) => l.status === "half").length,
      skipped: mine.filter((l) => l.status === "skipped").length,
      late: mine.filter((l) => l.late).length,
      days: Object.fromEntries(mine.map((l) => [l.localDate, l.status])),
    };
  });
}
