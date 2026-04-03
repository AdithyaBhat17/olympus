import { NextRequest, NextResponse } from "next/server";
import { verifyMcpAuth } from "../../auth";
import { db } from "@/lib/db";
import { sessions, sessionExercises, exercises } from "@/lib/db/schema";
import { eq, and, desc, ilike } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const result = await verifyMcpAuth(request);
  if (result instanceof NextResponse) return result;
  const email = result;

  const name = request.nextUrl.searchParams.get("name");
  if (!name || name.length > 200) {
    return NextResponse.json(
      { data: null, error: "Invalid or missing name parameter" },
      { status: 400 }
    );
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  let limit = 10;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1) limit = Math.min(parsed, 50);
  }

  try {
    const exercise = await db.query.exercises.findFirst({
      where: ilike(exercises.name, name),
    });

    if (!exercise) {
      return NextResponse.json({ data: [], error: null });
    }

    const history = await db
      .select({
        date: sessions.date,
        sessionName: sessions.sessionName,
        sets: sessionExercises.sets,
        reps: sessionExercises.reps,
        weight: sessionExercises.weight,
        rpe: sessionExercises.rpe,
        notes: sessionExercises.notes,
      })
      .from(sessionExercises)
      .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
      .where(
        and(
          eq(sessionExercises.exerciseId, exercise.id),
          eq(sessions.userId, email)
        )
      )
      .orderBy(desc(sessions.date))
      .limit(limit);

    return NextResponse.json({
      data: { exercise: { id: exercise.id, name: exercise.name }, history },
      error: null,
    });
  } catch (err) {
    console.error("MCP exercise history failed:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
