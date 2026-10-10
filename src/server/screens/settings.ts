import "server-only";
import { connectionStatus } from "@/server/oauth";
import { recentToolCalls } from "@/server/audit";
import { getWhoop, whoopConfigured } from "@/server/integrations/whoop";
import { getAppleHealth } from "@/server/integrations/apple-health";
import { getProfile } from "@/server/profile";
import { listConstraintRows } from "@/server/exercises";

/**
 * Settings for the iOS app. The web page builds its own (it has web push and
 * the Shortcut instructions); this is the same data, shaped for a native list.
 * Timestamps are ISO; the app formats them in the athlete's timezone.
 */
export async function settingsScreen(userId: string, origin: string) {
  const [clients, calls, whoop, health, profile, injuries] = await Promise.all([
    connectionStatus(userId),
    recentToolCalls(userId, 40),
    getWhoop(userId),
    getAppleHealth(userId),
    getProfile(userId),
    listConstraintRows(userId),
  ]);
  const writes = calls.filter((c) => c.kind === "write");
  const lastPush = calls.find((c) => c.tool === "push_plan" && c.ok) ?? writes[0] ?? null;

  return {
    email: userId,
    profile,
    claude: {
      connected: clients.length > 0,
      connectorUrl: `${origin}/api/mcp`,
      lastWrite: lastPush
        ? { kind: lastPush.tool === "push_plan" ? "push" : "write", at: lastPush.createdAt.toISOString() }
        : null,
      clients: clients.map((c) => ({
        clientId: c.clientId,
        name: c.name,
        since: c.since.toISOString(),
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      })),
      writes: writes.slice(0, 15).map((w) => ({
        id: w.id,
        tool: w.tool,
        ok: w.ok,
        summary: w.summary,
        at: w.createdAt.toISOString(),
      })),
    },
    whoop: {
      configured: whoopConfigured(),
      connected: !!whoop?.accessToken,
      lastSyncAt: whoop?.lastSyncAt?.toISOString() ?? null,
      lastError: whoop?.lastError ?? null,
    },
    appleHealth: { lastSyncAt: health?.lastSyncAt?.toISOString() ?? null },
    injuries: injuries.map((c) => ({
      id: c.id,
      region: c.region,
      rule: c.rule,
      blockedPatterns: c.blockedPatterns,
    })),
  };
}

export type SettingsScreen = Awaited<ReturnType<typeof settingsScreen>>;
