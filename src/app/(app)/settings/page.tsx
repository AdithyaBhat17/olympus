import Link from "next/link";
import { headers } from "next/headers";
import { auth, requireUserEmail } from "@/lib/auth";
import { formatSleep } from "@/domain";
import { connectionStatus, publicOrigin } from "@/server/oauth";
import { recentToolCalls } from "@/server/audit";
import { getWhoop, whoopConfigured } from "@/server/integrations/whoop";
import { getAppleHealth } from "@/server/integrations/apple-health";
import { getRecovery } from "@/server/checkins";
import { CopyField } from "@/components/settings/copy-field";
import {
  DisconnectClaudeButton,
  HealthTokenControls,
  WhoopButtons,
} from "@/components/settings/connection-buttons";
import { PushToggle } from "@/components/settings/push-toggle";
import SignOutButton from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

function ago(d: Date | null | undefined): string {
  if (!d) return "never";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function Status({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-[13px] ${on ? "text-info" : "text-muted"}`}>
      <span aria-hidden className={`w-2 h-2 rounded-full ${on ? "bg-info" : "bg-line-strong"}`} />
      {label}
    </span>
  );
}

function Section({
  title,
  status,
  children,
}: {
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-4 mt-4 p-4 rounded-2xl bg-surface flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px] font-bold leading-none">{title}</h2>
        {status}
      </div>
      {children}
    </section>
  );
}

const WHOOP_FLASH: Record<string, string> = {
  connected: "Whoop connected — last 14 nights synced.",
  denied: "Whoop access was declined.",
  state_mismatch: "That Whoop sign-in expired. Try again.",
  error: "Whoop sign-in failed. Check the server logs.",
  not_configured: "Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET first.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await requireUserEmail();
  const session = await auth();
  const sp = await searchParams;
  const h = await headers();
  const origin = publicOrigin(
    new Request(`https://${h.get("host") ?? "localhost"}/`, { headers: h })
  );

  const [clients, calls, whoop, health, recovery] = await Promise.all([
    connectionStatus(userId),
    recentToolCalls(userId, 40),
    getWhoop(userId),
    getAppleHealth(userId),
    getRecovery(userId),
  ]);
  const lastCall = calls[0] ?? null;
  const writes = calls.filter((c) => c.kind === "write");
  const sleepSource = recovery.today?.sources.sleep;
  const nutritionSource = recovery.today?.sources.protein;

  return (
    <div className="pb-8">
      <header className="px-4 pt-[max(3.25rem,env(safe-area-inset-top))] pb-2 flex items-center gap-2">
        <Link
          href="/today"
          aria-label="Back to Today"
          className="w-11 h-11 flex items-center justify-center text-fg"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <div className="flex flex-col">
          <span className="text-[13px] text-muted">{session?.user?.email}</span>
          <h1 className="font-display text-[38px] font-bold leading-none">Settings</h1>
        </div>
      </header>

      <h2 className="eyebrow px-5 mt-4">Connections</h2>

      {/* Claude ----------------------------------------------------------- */}
      <Section
        title="Claude (LiftLog MCP)"
        status={<Status on={clients.length > 0} label={clients.length ? "Connected" : "Not connected"} />}
      >
        <CopyField label="Custom connector URL" value={`${origin}/api/mcp`} />
        <p className="text-[13px] text-muted leading-relaxed">
          In Claude: Settings › Connectors › Add custom connector, paste the URL, then sign in with
          Google when asked. Works on phone, web and desktop.
        </p>

        {clients.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {clients.map((c) => (
              <li key={c.clientId} className="py-2.5 flex justify-between gap-3 text-sm">
                <span className="text-fg-2 truncate">{c.name}</span>
                <span className="text-muted shrink-0">used {ago(c.lastUsedAt)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-muted text-xs">Last tool call</span>
            <span className="text-fg-2">
              {lastCall ? (
                <>
                  <span className="font-mono text-[13px]">{lastCall.tool}</span> · {ago(lastCall.createdAt)}
                </>
              ) : (
                "None yet"
              )}
            </span>
          </div>
          {clients.length > 0 && <DisconnectClaudeButton />}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="eyebrow">Audit log · writes</h3>
          {writes.length === 0 ? (
            <p className="text-sm text-muted">Claude hasn&apos;t changed anything yet.</p>
          ) : (
            <ol className="flex flex-col">
              {writes.slice(0, 15).map((c) => (
                <li key={c.id} className="py-2.5 border-b border-line-soft last:border-0 flex flex-col gap-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-mono text-[13px] text-fg-2">{c.tool}</span>
                    <span className={`text-xs ${c.ok ? "text-muted" : "text-danger-soft"}`}>
                      {c.ok ? "" : "rejected · "}
                      {c.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: process.env.APP_TIMEZONE || "Asia/Dubai" })}
                    </span>
                  </div>
                  {c.summary && <span className="text-[13px] text-muted leading-snug line-clamp-3">{c.summary}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>

      {/* Whoop ------------------------------------------------------------ */}
      <Section
        title="Whoop · sleep"
        status={<Status on={!!whoop?.accessToken} label={whoop?.accessToken ? `Synced ${ago(whoop.lastSyncAt)}` : "Off"} />}
      >
        {sp.whoop && WHOOP_FLASH[sp.whoop] && (
          <p role="status" className="text-sm p-3 rounded-xl bg-surface-2 text-fg-2">
            {WHOOP_FLASH[sp.whoop]}
          </p>
        )}
        <p className="text-[13px] text-muted leading-relaxed">
          Pulls last night&apos;s sleep (time asleep, not time in bed) into the recovery check-in every
          30 minutes while you use the app, and whenever Claude asks for recovery. A value you type
          yourself always wins.
          {sleepSource === "whoop" && recovery.today?.sleepMin != null && (
            <> Today: <span className="text-fg-2">{formatSleep(recovery.today.sleepMin)}</span>.</>
          )}
        </p>
        {whoop?.lastError && <p className="text-[13px] text-danger-soft">Last error: {whoop.lastError}</p>}
        {whoopConfigured() ? (
          <WhoopButtons connected={!!whoop?.accessToken} />
        ) : (
          <p className="text-[13px] text-accent-soft">
            Server needs WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET (developer.whoop.com) — see README.
          </p>
        )}
      </Section>

      {/* Apple Health ----------------------------------------------------- */}
      <Section
        title="Apple Health · protein & water"
        status={<Status on={!!health?.ingestTokenHash} label={health?.ingestTokenHash ? `Last push ${ago(health.lastSyncAt)}` : "Off"} />}
      >
        <p className="text-[13px] text-muted leading-relaxed">
          MyFitnessPal has no public API and Apple Health has no web API, so this runs from your
          iPhone: MyFitnessPal writes nutrition to Apple Health, and a Shortcut sends today&apos;s
          totals here.
          {nutritionSource === "apple_health" && recovery.today?.proteinG != null && (
            <> Today: <span className="text-fg-2">{recovery.today.proteinG} g protein</span>.</>
          )}
        </p>
        <HealthTokenControls hasToken={!!health?.ingestTokenHash} endpoint={`${origin}/api/ingest/health`} />
        <details className="group">
          <summary className="cursor-pointer text-sm text-fg-2 py-2 list-none flex justify-between items-center min-h-[44px]">
            Set it up (5 min)
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <ol className="list-decimal pl-5 flex flex-col gap-2 text-[13px] text-muted leading-relaxed">
            <li>MyFitnessPal › More › Settings › Sharing &amp; Privacy › Apple Health: allow it to write <span className="text-fg-2">Protein</span> and <span className="text-fg-2">Water</span>.</li>
            <li>Shortcuts › New Shortcut. Add <span className="text-fg-2">Find Health Samples</span>: Type = Protein, Start Date is Today. Then <span className="text-fg-2">Calculate Statistics</span> › Sum.</li>
            <li>Repeat for Type = Water (unit mL).</li>
            <li>Add <span className="text-fg-2">Get Contents of URL</span>: the endpoint above, Method POST, Header <span className="font-mono">Authorization</span> = <span className="font-mono">Bearer &lt;token&gt;</span>, Request Body JSON with <span className="font-mono">proteinG</span> and <span className="font-mono">waterMl</span> set to the two sums.</li>
            <li>Automation › Personal › <span className="text-fg-2">App: MyFitnessPal is closed</span> (and/or a time of day) › run the shortcut, without asking.</li>
          </ol>
        </details>
      </Section>

      {/* Push ------------------------------------------------------------- */}
      <Section title="Notifications">
        <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </Section>

      <div className="mx-4 mt-6 flex items-center justify-between">
        <Link href="/form" className="text-sm text-muted hover:text-fg-2 min-h-[44px] flex items-center">
          Form cues
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}
