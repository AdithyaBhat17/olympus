import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import HistoryList from "@/components/history-list";

export default async function HistoryPage() {
  const email = await requireUserEmail();

  const userSessions = await db.query.sessions.findMany({
    where: eq(sessions.userId, email),
    orderBy: [desc(sessions.date)],
    limit: 50,
    with: {
      sessionExercises: {
        with: { exercise: true },
      },
    },
  });

  const sessionNames = [
    ...new Set(userSessions.map((s) => s.sessionName)),
  ];

  return (
    <div className="py-6">
      <h2 className="text-2xl font-black tracking-tight mb-6">HISTORY</h2>
      <HistoryList
        sessions={userSessions as Parameters<typeof HistoryList>[0]["sessions"]}
        sessionNames={sessionNames}
      />
    </div>
  );
}
