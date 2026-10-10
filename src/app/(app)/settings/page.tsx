import Link from "next/link";
import { headers } from "next/headers";
import { getSession, requireUserEmail } from "@/lib/auth";
import { formatTimeInTz } from "@/lib/dates";
import { formatSleep } from "@/domain";
import { connectionStatus, publicOrigin } from "@/server/oauth";
import { recentToolCalls } from "@/server/audit";
import { getWhoop, whoopConfigured } from "@/server/integrations/whoop";
import { getAppleHealth } from "@/server/integrations/apple-health";
import { getRecovery } from "@/server/checkins";
import { getProfile } from "@/server/profile";
import { listConstraintRows } from "@/server/exercises";
import { BackIcon } from "@/components/page-header";
import { CopyField } from "@/components/settings/copy-field";
import {
  DisconnectClaudeButton,
  HealthTokenControls,
  WhoopButtons,
} from "@/components/settings/connection-buttons";
import { PushToggle } from "@/components/settings/push-toggle";
import { GymFloorPrefs } from "@/components/settings/gym-floor-prefs";
import { ProfileForm } from "@/components/settings/profile-form";
import { Injuries } from "@/components/settings/injuries";
import SignOutButton from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

function ago(d: Date | null | undefined): string {
  if (!d) return "never";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** "07:12" today, else "3 d ago". */
function syncedAt(d: Date | null | undefined, tz: string): string {
  if (!d) return "never";
  return Date.now() - d.getTime() < 20 * 3600 * 1000 ? formatTimeInTz(d, tz) : ago(d);
}

const WHOOP_FLASH: Record<string, string> = {
  connected: "Whoop connected. The last 14 nights are synced.",
  denied: "Whoop access was declined.",
  state_mismatch: "That Whoop sign-in expired. Try again.",
  error: "Whoop sign-in failed. Check the server logs.",
  not_configured: "Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET first.",
};

const ico = "w-8 h-8 shrink-0 rounded-[9px] flex items-center justify-center";
const row = "flex items-center gap-3 min-h-14 px-4 py-2";
const chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint transition-transform group-open:rotate-90">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await requireUserEmail();
  const session = await getSession();
  const sp = await searchParams;
  const h = await headers();
  const origin = publicOrigin(new Request(`https://${h.get("host") ?? "localhost"}/`, { headers: h }));

  const [clients, calls, whoop, health, recovery, profile, injuries] = await Promise.all([
    connectionStatus(userId),
    recentToolCalls(userId, 40),
    getWhoop(userId),
    getAppleHealth(userId),
    getRecovery(userId),
    getProfile(userId),
    listConstraintRows(userId),
  ]);
  const tz = profile.timezone;
  const writes = calls.filter((c) => c.kind === "write");
  const lastPush = calls.find((c) => c.tool === "push_plan" && c.ok) ?? writes[0] ?? null;
  const sleepSource = recovery.today?.sources.sleep;
  const nutritionSource = recovery.today?.sources.protein;
  const name = session?.user?.name?.trim() || session?.user?.email || "You";
  const connected = clients.length > 0;

  return (
    <div className="flex flex-col">
      <header className="page-top px-3 flex items-center">
        <Link href="/today" aria-label="Back to Today" className="btn-pill pl-2">
          <BackIcon />
          Today
        </Link>
      </header>

      <div className="arrive flex items-center gap-3.5 px-5 pt-5">
        <span className="w-14 h-14 rounded-full bg-accent text-accent-ink flex items-center justify-center num text-[28px]">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="font-display font-extrabold text-[30px] leading-none truncate">{name}</span>
          <span className="text-[13px] text-muted truncate">Signed in with Google, {session?.user?.email}</span>
        </span>
      </div>

      {/* Your PT ---------------------------------------------------------- */}
      <section aria-labelledby="pt-h" className="arrive arrive-1 mx-3 mt-6">
        <h2 id="pt-h" className="section-label mx-2 mb-2.5">
          Your PT
        </h2>
        <div className="p-4 rounded-[20px] bg-surface flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className={`${ico} bg-info-bg text-info`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12h4l2-5 4 10 2-5h4" />
              </svg>
            </span>
            <span className="flex-1 flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold">Claude connector</span>
              <span className={`text-[13px] ${connected ? "text-info" : "text-muted"}`}>
                {connected
                  ? `Connected${lastPush ? `, last ${lastPush.tool === "push_plan" ? "push" : "write"} ${syncedAt(lastPush.createdAt, tz)}` : ""}`
                  : "Not connected"}
              </span>
            </span>
            {connected && <DisconnectClaudeButton />}
          </div>
          <CopyField label="Custom connector URL" value={`${origin}/api/mcp`} />
          {!connected && (
            <p className="m-0 px-1 text-[13px] text-muted leading-relaxed">
              In Claude: Settings › Connectors › Add custom connector, paste the URL, then sign in with Google when
              asked.
            </p>
          )}
          {(clients.length > 0 || writes.length > 0) && (
            <details className="group">
              <summary className="min-h-11 px-1 flex items-center justify-between text-sm text-fg-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Clients &amp; audit log
                {chevron}
              </summary>
              <ul className="m-0 p-0 list-none flex flex-col">
                {clients.map((c) => (
                  <li key={c.clientId} className="py-2.5 px-1 flex justify-between gap-3 text-sm border-b border-line">
                    <span className="text-fg-2 truncate">{c.name}</span>
                    <span className="text-muted shrink-0">used {ago(c.lastUsedAt)}</span>
                  </li>
                ))}
              </ul>
              {writes.length === 0 ? (
                <p className="m-0 mt-2 px-1 text-sm text-muted">Claude hasn&apos;t changed anything yet.</p>
              ) : (
                <ol className="m-0 p-0 list-none flex flex-col">
                  {writes.slice(0, 15).map((c) => (
                    <li key={c.id} className="py-2.5 px-1 border-b border-line last:border-0 flex flex-col gap-1">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-[13px] text-fg-2">{c.tool}</span>
                        <span className={`text-[11px] ${c.ok ? "text-muted" : "text-danger-text"}`}>
                          {c.ok ? "" : "Rejected, "}
                          {c.createdAt.toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: tz,
                          })}
                        </span>
                      </div>
                      {c.summary && <span className="text-[13px] text-muted leading-snug line-clamp-3">{c.summary}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </details>
          )}
        </div>
      </section>

      {/* Your training ----------------------------------------------------- */}
      <section aria-labelledby="train-h" className="arrive arrive-2 mx-3 mt-[22px]">
        <h2 id="train-h" className="section-label mx-2 mb-2.5">
          Your training
        </h2>
        <ProfileForm
          initial={{
            timezone: tz,
            rotation: profile.rotation,
            minSleepMin: profile.targets.minSleepMin,
            kcal: profile.targets.kcal,
            proteinG: profile.targets.proteinG,
            waterMl: profile.targets.waterMl,
          }}
        />
      </section>

      {/* Injuries & limits -------------------------------------------------- */}
      <section aria-labelledby="inj-h" className="arrive arrive-2 mx-3 mt-[22px]">
        <h2 id="inj-h" className="section-label mx-2 mb-2.5">
          Injuries &amp; limits
        </h2>
        <Injuries
          items={injuries.map((c) => ({ id: c.id, region: c.region, rule: c.rule, blockedPatterns: c.blockedPatterns }))}
        />
      </section>

      {/* Recovery sources -------------------------------------------------- */}
      <section aria-labelledby="src-h" className="arrive arrive-2 mx-3 mt-[22px]">
        <h2 id="src-h" className="section-label mx-2 mb-2.5">
          Recovery sources
        </h2>
        {sp.whoop && WHOOP_FLASH[sp.whoop] && (
          <p role="status" className="m-0 mb-2 text-sm p-3 rounded-[14px] bg-surface-2 text-fg-2">
            {WHOOP_FLASH[sp.whoop]}
          </p>
        )}
        <div className="card-group">
          <div className={`${row} border-b border-line`}>
            <span className={`${ico} bg-surface-3 text-fg font-display font-black text-[15px]`}>W</span>
            <span className="flex-1 flex flex-col gap-0.5 min-w-0">
              <span>Whoop</span>
              <span className="text-xs text-muted">
                {whoop?.accessToken ? `Sleep, HRV, resting HR, synced ${syncedAt(whoop.lastSyncAt, tz)}` : "Sleep, HRV, resting HR, not connected"}
                {sleepSource === "whoop" && recovery.today?.sleepMin != null && `, ${formatSleep(recovery.today.sleepMin)}`}
              </span>
              {whoop?.lastError && <span className="text-xs text-danger-text">Last error: {whoop.lastError}</span>}
            </span>
            {whoopConfigured() ? (
              <WhoopButtons connected={!!whoop?.accessToken} />
            ) : (
              <span className="text-xs text-muted">Not configured</span>
            )}
          </div>
          <details className="group">
            <summary className={`${row} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <span className={`${ico} bg-surface-3 text-danger`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 21s-7.5-4.6-9.3-9.2C1.5 8.6 3.6 5 7.2 5c2 0 3.4 1 4.8 2.6C13.4 6 14.8 5 16.8 5c3.6 0 5.7 3.6 4.5 6.8C19.5 16.4 12 21 12 21z" />
                </svg>
              </span>
              <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                <span>Apple Health</span>
                <span className="text-xs text-muted">
                  Protein, water, sleep, HRV via the iPhone app or a Shortcut
                  {health?.ingestTokenHash ? `, last push ${ago(health.lastSyncAt)}` : ""}
                  {nutritionSource === "apple_health" && recovery.today?.proteinG != null && `, ${recovery.today.proteinG} g today`}
                </span>
              </span>
              <span className="h-11 px-3 rounded-[10px] bg-surface-3 text-fg-2 text-[13px] flex items-center">Set up</span>
            </summary>
            <div className="px-4 pb-4 flex flex-col gap-3">
              <HealthTokenControls hasToken={!!health?.ingestTokenHash} endpoint={`${origin}/api/ingest/health`} />
              <p className="m-0 text-[13px] text-muted leading-relaxed">
                <span className="text-fg-2">Olympus for iPhone:</span> sign in, then Settings › Apple Health › Allow
                Health access. It syncs protein, water, sleep, HRV and resting HR in the background, no token needed.
                Where Health has no HRV or resting HR, Whoop&apos;s fill in. No iPhone app? Use a Shortcut with a token:
              </p>
              <ol className="m-0 list-decimal pl-5 flex flex-col gap-2 text-[13px] text-muted leading-relaxed">
                <li>
                  MyFitnessPal › More › Settings › Sharing &amp; Privacy › Apple Health: allow it to write{" "}
                  <span className="text-fg-2">Protein</span> and <span className="text-fg-2">Water</span>.
                </li>
                <li>
                  Shortcuts › New Shortcut. Add <span className="text-fg-2">Find Health Samples</span>: Type = Protein,
                  Start Date is Today. Then <span className="text-fg-2">Calculate Statistics</span> › Sum.
                </li>
                <li>Repeat for Type = Water (unit mL).</li>
                <li>
                  Add <span className="text-fg-2">Get Contents of URL</span>: the endpoint above, Method POST, Header{" "}
                  <span className="text-fg-2">Authorization</span> = <span className="text-fg-2">Bearer &lt;token&gt;</span>,
                  Request Body JSON with <span className="text-fg-2">proteinG</span> and{" "}
                  <span className="text-fg-2">waterMl</span> set to the two sums.
                </li>
                <li>
                  Automation › Personal › <span className="text-fg-2">App: MyFitnessPal is closed</span> (and/or a time of
                  day) › run the shortcut, without asking.
                </li>
              </ol>
            </div>
          </details>
        </div>
      </section>

      {/* On the gym floor --------------------------------------------------- */}
      <section aria-labelledby="pref-h" className="arrive arrive-3 mx-3 mt-[22px]">
        <h2 id="pref-h" className="section-label mx-2 mb-2.5">
          On the gym floor
        </h2>
        <div className="card-group">
          <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
          <GymFloorPrefs />
        </div>
      </section>

      <div className="mx-3 mt-[22px] flex flex-col gap-2">
        <Link href="/form" className="btn-secondary">
          Form cues
        </Link>
        <SignOutButton />
        <p className="m-0 mt-1 text-center text-xs text-faint">Olympus, offline-ready, v3</p>
      </div>
    </div>
  );
}
