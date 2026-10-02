import "server-only";
import { db } from "@/lib/db";
import { mcpAuditLog } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function recordToolCall(entry: {
  userId: string;
  tool: string;
  kind: "read" | "write";
  ok: boolean;
  summary?: string | null;
  input?: unknown;
  clientId?: string | null;
}) {
  try {
    await db.insert(mcpAuditLog).values({
      userId: entry.userId,
      tool: entry.tool,
      kind: entry.kind,
      ok: entry.ok,
      summary: entry.summary?.slice(0, 500) ?? null,
      // Reads are logged without their input; writes keep it for the audit trail.
      input: entry.kind === "write" ? (entry.input as object) ?? null : null,
      clientId: entry.clientId ?? null,
    });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}

export async function recentToolCalls(userId: string, limit = 30) {
  return db
    .select()
    .from(mcpAuditLog)
    .where(eq(mcpAuditLog.userId, userId))
    .orderBy(desc(mcpAuditLog.createdAt))
    .limit(limit);
}
