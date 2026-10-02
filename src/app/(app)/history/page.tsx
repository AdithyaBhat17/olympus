import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { resolveSets } from "@/server/history";
import { formatDayShort } from "@/lib/dates";
import HistoryList, { type HistorySession } from "@/components/history-list";

export const metadata = { title: "Log" };

export default async function HistoryPage() {
  const email = await requireUserEmail();

  const userSessions = await db.query.sessions.findMany({
    where: eq(sessions.userId, email),
    orderBy: [desc(sessions.date), desc(sessions.createdAt)],
    limit: 50,
    with: {
      sessionExercises: {
        with: { exercise: true },
      },
    },
  });

  const items: HistorySession[] = userSessions.map((s) => ({
    id: s.id,
    date: s.date,
    eyebrow: `${formatDayShort(s.date)} · W${s.weekNumber} · B${s.blockNumber}`,
    sessionName: s.sessionName,
    sessionType: s.sessionType,
    weekNumber: s.weekNumber,
    blockNumber: s.blockNumber,
    notes: s.notes,
    status: s.status,
    sent: s.sentAt != null,
    exercises: [...s.sessionExercises]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((se) => ({
        id: se.id,
        name: se.exercise.name,
        notes: se.notes,
        sets: resolveSets(se).map((set) => ({
          reps: set.reps,
          weight: set.weight,
          rpe: set.rpe ?? null,
          warmup: set.type === "warmup",
          underloaded: !!set.flags?.includes("underloaded"),
        })),
      })),
  }));

  const sessionNames = Array.from(new Set(items.map((s) => s.sessionName)));

  return (
    <div className="flex flex-col pb-8">
      <header className="px-5 pb-2 flex items-end justify-between gap-3 pt-[max(56px,calc(env(safe-area-inset-top)_+_12px))]">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="eyebrow font-normal">
            {items.length} {items.length === 1 ? "session" : "sessions"}
          </span>
          <h1 className="font-display font-bold text-[44px] leading-none">Log</h1>
        </div>
        <Link
          href="/log"
          className="h-11 px-3.5 -mr-1 rounded-xl border border-line bg-surface text-sm font-medium flex items-center gap-1.5 hover:bg-surface-2 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Manual
        </Link>
      </header>
      <HistoryList sessions={items} sessionNames={sessionNames} />
    </div>
  );
}
