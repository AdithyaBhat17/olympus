import { NextRequest, NextResponse } from "next/server";
import { verifyMcpAuth } from "../auth";
import { db } from "@/lib/db";
import { sessions, sessionExercises } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const result = await verifyMcpAuth(request);
  if (result instanceof NextResponse) return result;
  const email = result;

  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { data: null, error: "Invalid or missing date parameter (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const results = await db.query.sessions.findMany({
      where: and(eq(sessions.userId, email), eq(sessions.date, date)),
      with: {
        sessionExercises: {
          with: { exercise: true },
          orderBy: [asc(sessionExercises.orderIndex)],
        },
      },
    });

    return NextResponse.json({ data: results, error: null });
  } catch (err) {
    console.error("MCP sessions by date failed:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
