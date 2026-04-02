import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { exercises, sessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import SessionForm from "@/components/session-form";
import type { Exercise } from "@/lib/types";

export default async function LogPage() {
  const email = await requireUserEmail();

  const [allExercises, recentNames] = await Promise.all([
    db.select().from(exercises).orderBy(exercises.name),
    db
      .selectDistinct({ sessionName: sessions.sessionName })
      .from(sessions)
      .where(eq(sessions.userId, email))
      .orderBy(desc(sessions.date)),
  ]);

  const recentSessionNames = recentNames.map((s) => s.sessionName);

  return (
    <SessionForm
      exercises={allExercises as Exercise[]}
      recentSessionNames={recentSessionNames}
    />
  );
}
