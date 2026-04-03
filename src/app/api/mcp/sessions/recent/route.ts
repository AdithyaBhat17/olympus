import { NextRequest, NextResponse } from "next/server";
import { verifyMcpAuth } from "../../auth";
import { db } from "@/lib/db";
import { sessions, sessionExercises } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const result = await verifyMcpAuth(request);
  if (result instanceof NextResponse) return result;
  const email = result;

  const limitParam = request.nextUrl.searchParams.get("limit");
  let limit = 5;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1) limit = Math.min(parsed, 20);
  }

  try {
    const results = await db.query.sessions.findMany({
      where: eq(sessions.userId, email),
      orderBy: [desc(sessions.date), desc(sessions.createdAt)],
      limit,
      with: {
        sessionExercises: {
          with: { exercise: true },
          orderBy: [asc(sessionExercises.orderIndex)],
        },
      },
    });

    return NextResponse.json({ data: results, error: null });
  } catch (err) {
    console.error("MCP recent sessions failed:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
