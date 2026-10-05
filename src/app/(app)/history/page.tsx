import Link from "next/link";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { resolveSets } from "@/server/history";
import { addDays, formatDayShort, todayInTz } from "@/lib/dates";
import { ROTATION_LETTER } from "@/domain/rotation";
import { getProfile } from "@/server/profile";
import { formatKg } from "@/domain/load";
import { PageHeader } from "@/components/page-header";
import HistoryList, { type HistoryDay, type HistorySession, type SessionKind } from "@/components/history-list";

export const metadata = { title: "Log" };

const WEEKS = 5;

/** Monday of the week containing `iso`. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

function kindOf(type: string | null, exercises: Array<{ category: string; loadMode: string }>): SessionKind {
  // Any session letter keeps its colour, even one from an older rotation.
  if (type && ROTATION_LETTER.test(type)) return type;
  if (exercises.length > 0 && exercises.every((e) => e.loadMode === "TIME" || e.category === "Cardio")) return "cardio";
  if (type?.toLowerCase() === "cardio") return "cardio";
  return "other";
}

export default async function HistoryPage() {
  const email = await requireUserEmail();
  const profile = await getProfile(email);
  const today = todayInTz(profile.timezone);

  const [userSessions, [{ total }], [first]] = await Promise.all([
    db.query.sessions.findMany({
      where: eq(sessions.userId, email),
      orderBy: [desc(sessions.date), desc(sessions.createdAt)],
      limit: 60,
      with: { sessionExercises: { with: { exercise: true } } },
    }),
    db.select({ total: count() }).from(sessions).where(and(eq(sessions.userId, email), eq(sessions.status, "DONE"))),
    db.select({ date: sessions.date }).from(sessions).where(eq(sessions.userId, email)).orderBy(asc(sessions.date)).limit(1),
  ]);

  const items: HistorySession[] = userSessions.map((s) => {
    const sets = s.sessionExercises.flatMap((se) => resolveSets(se));
    const working = sets.filter((x) => x.type !== "warmup");
    const rpes = working.map((x) => x.rpe).filter((r): r is number => r != null);
    const timed = s.sessionExercises.every((se) => se.exercise.loadMode === "TIME");
    const minutes =
      s.startedAt && s.finishedAt
        ? Math.round((s.finishedAt.getTime() - s.startedAt.getTime()) / 60000)
        : timed
          ? sets.reduce((a, x) => a + x.reps, 0)
          : null;
    const kind = kindOf(
      s.sessionType,
      s.sessionExercises.map((se) => ({ category: se.exercise.category, loadMode: se.exercise.loadMode }))
    );
    const title = s.sessionName.replace(/^Session \S+\s*·\s*/, "");
    const meta = [
      minutes != null && minutes > 0 ? `${minutes} min` : null,
      kind === "cardio" ? null : `${working.length} sets`,
      rpes.length ? `RPE ${formatKg(Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      id: s.id,
      date: s.date,
      title: `${formatDayShort(s.date)}, ${title}`,
      meta: meta || `${s.sessionExercises.length} exercises`,
      kind,
      live: s.status === "IN_PROGRESS",
      sent: s.sentAt != null,
    };
  });

  // Calendar: five Monday-start weeks ending with this week.
  const start = addDays(mondayOf(today), -7 * (WEEKS - 1));
  const byDate = new Map<string, SessionKind>();
  for (const s of [...items].reverse()) {
    if (s.date >= start && !s.live) byDate.set(s.date, s.kind);
  }
  const days: HistoryDay[] = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, kind: date > today ? null : byDate.get(date) ?? null, today: date === today, future: date > today };
  });

  // Stats.
  const thisMonday = mondayOf(today);
  const done = items.filter((s) => !s.live);
  const thisWeek = done.filter((s) => s.date >= thisMonday).length;
  const weeksSince = first ? Math.max(1, Math.ceil((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${mondayOf(first.date)}T12:00:00Z`)) / (7 * 86_400_000))) : 1;
  const avg = Math.round((total / weeksSince) * 10) / 10;
  const weeksWith = new Set(done.map((s) => mondayOf(s.date)));
  let streak = 0;
  let wk = weeksWith.has(thisMonday) ? thisMonday : addDays(thisMonday, -7);
  while (weeksWith.has(wk)) {
    streak++;
    wk = addDays(wk, -7);
  }

  const startLabel = new Date(`${start}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const endLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const firstLabel = first
    ? new Date(`${first.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${total} session${total === 1 ? "" : "s"}${firstLabel ? ` since ${firstLabel}` : ""}`}
        title="Log"
        action={
          <Link
            href="/log"
            aria-label="Log a past session"
            className="w-11 h-11 rounded-full bg-accent text-accent-ink flex items-center justify-center shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        }
      />
      <HistoryList
        sessions={items}
        days={days}
        range={startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`}
        stats={{ thisWeek, avg, streak }}
        thisMonday={thisMonday}
        lastMonday={addDays(thisMonday, -7)}
        rotation={profile.rotation}
      />
    </div>
  );
}
