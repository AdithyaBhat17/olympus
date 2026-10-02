import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { exercises, sessions } from "@/lib/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import SessionForm from "@/components/session-form";
import type { Exercise } from "@/lib/types";

export const metadata = { title: "Log a session" };

export default async function LogPage() {
  const email = await requireUserEmail();

  const [allExercises, recentNames] = await Promise.all([
    db
      .select()
      .from(exercises)
      .where(or(isNull(exercises.createdBy), eq(exercises.createdBy, email)))
      .orderBy(exercises.name),
    db
      .selectDistinct({ sessionName: sessions.sessionName })
      .from(sessions)
      .where(eq(sessions.userId, email)),
  ]);

  const recentSessionNames = recentNames.map((s) => s.sessionName);

  return (
    <SessionForm
      exercises={allExercises as Exercise[]}
      recentSessionNames={recentSessionNames}
    />
  );
}
