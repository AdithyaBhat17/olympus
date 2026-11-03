import Link from "next/link";
import { requireUserEmail } from "@/lib/auth";
import { addDays, formatTimeInTz } from "@/lib/dates";
import { scheduleLabel, SLOTS, MARKERS } from "@/domain/supplements";
import { todayFor, getProfile } from "@/server/profile";
import { adherence, labSummary, listRules, listStack, todaySlots, upcomingAppointments } from "@/server/supplements";
import { PageHeader, BackIcon } from "@/components/page-header";
import { SlotCard } from "@/components/supplements/slot-card";
import { StackEditor, LabsEditor, AppointmentEditor, InventoryButton } from "@/components/supplements/manager";

export const metadata = { title: "Supplements" };

const SLOT_LABEL = Object.fromEntries(SLOTS.map((s) => [s.slot, s.label]));

export default async function SupplementsPage() {
  const userId = await requireUserEmail();
  const [today, profile] = await Promise.all([todayFor(userId), getProfile(userId)]);
  const [slots, stack, labs, appts, rules, adh] = await Promise.all([
    todaySlots(userId, today),
    listStack(userId),
    labSummary(userId),
    upcomingAppointments(userId),
    listRules(userId),
    adherence(userId, addDays(today, -13), today),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  return (
    <div className="pb-16">
      <div className="px-4 pt-4">
        <Link href="/food" className="inline-flex items-center gap-1 h-9 pr-3 text-fg-2 text-[15px]">
          <BackIcon /> Food
        </Link>
      </div>
      <PageHeader title="Supplements" eyebrow="Reminders and records. Not medical advice." />
      <div className="mt-6">
        <SlotCard data={slots} />
      </div>

      <section className="card mx-3 mt-3 px-4 py-3" aria-labelledby="stack-h">
        <div className="flex items-baseline justify-between">
          <h2 id="stack-h" className="m-0 text-[15px] font-semibold">Your stack</h2>
          <StackEditor />
        </div>
        <ul className="m-0 p-0 list-none">
          {stack.map((s) => (
            <li key={s.id} className="py-2.5 border-b border-line last:border-0 flex gap-2 items-start">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px]">
                  {s.name}
                  {s.brand ? <span className="text-muted"> · {s.brand}</span> : null}
                </span>
                <span className="block text-[12px] text-muted">
                  {s.servingsPerDose !== 1 ? `${s.servingsPerDose} × ` : ""}
                  {s.servingDesc} · {SLOT_LABEL[s.slot]} · {scheduleLabel(s.activeDays)}
                  {s.foodId ? " · logs food" : ""}
                </span>
                <span className={`block text-[12px] ${s.lowStock ? "text-danger-text" : "text-muted"}`}>
                  {s.servingsLeft == null ? "Stock not tracked yet" : `${s.servingsLeft} servings left · about ${s.daysLeft} days`}
                  {s.whereToBuy.length ? ` · buy: ${s.whereToBuy.map((w) => `${w.region}${w.note ? ` (${w.note})` : ""}`).join(", ")}` : ""}
                </span>
                {s.notes && <span className="block text-[12px] text-muted">{s.notes}</span>}
              </span>
              <span className="flex gap-1 shrink-0">
                <InventoryButton id={s.id} name={s.name} />
                <StackEditor existing={s} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {adh.length > 0 && (
        <section className="card mx-3 mt-3 px-4 py-3" aria-labelledby="adh-h">
          <h2 id="adh-h" className="m-0 text-[15px] font-semibold">Last 14 days</h2>
          <p className="m-0 mb-2 text-[12px] text-muted">A record, not a score. ● taken · ◐ half · ○ skipped · · not logged</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {adh.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[13px] truncate">{a.name}</span>
                <span className="font-mono text-[13px] tracking-[0.2em] text-fg-2" aria-label={`${a.taken} of ${a.scheduled} scheduled days taken`}>
                  {days.map((d) => ({ taken: "●", half: "◐", skipped: "○" } as Record<string, string>)[a.days[d] ?? ""] ?? "·").join("")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mx-3 mt-3 px-4 py-3" aria-labelledby="labs-h">
        <div className="flex items-baseline justify-between">
          <h2 id="labs-h" className="m-0 text-[15px] font-semibold">Labs</h2>
          <LabsEditor />
        </div>
        {labs.length === 0 && <p className="m-0 text-[13px] text-muted py-2">Add a past result to start tracking trends and retest dates.</p>}
        <ul className="m-0 p-0 list-none">
          {labs.map((m) => (
            <li key={m.marker} className="py-2.5 border-b border-line last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px]">{m.label}</span>
                <span className="text-[12px] text-muted">
                  {m.due ? `retest due ~${m.due}` : m.results.length ? "" : "no result yet"}
                </span>
              </div>
              {m.results.length > 0 && (
                <div className="text-[13px] num text-fg-2">
                  {m.results.slice(-4).map((r) => `${r.drawnOn.slice(0, 7)}: ${r.value} ${r.unit}`).join(" → ")}
                </div>
              )}
              {m.supplements.length > 0 && <div className="text-[12px] text-muted">Related: {m.supplements.join(", ")}</div>}
            </li>
          ))}
        </ul>
        <p className="m-0 mt-2 text-[12px] text-muted">Trends are for talking to your doctor, not for diagnosis.</p>
      </section>

      <section className="card mx-3 mt-3 px-4 py-3" aria-labelledby="appt-h">
        <div className="flex items-baseline justify-between">
          <h2 id="appt-h" className="m-0 text-[15px] font-semibold">Blood tests</h2>
          <AppointmentEditor markers={Object.entries(MARKERS).map(([k, v]) => ({ key: k, label: v.label }))} />
        </div>
        {appts.length === 0 && <p className="m-0 text-[13px] text-muted py-2">Schedule one to get a checklist for the days before.</p>}
        {appts.map((a) => (
          <div key={a.id} className="py-2.5 border-b border-line last:border-0">
            <div className="text-[15px]">
              {new Date(a.scheduledAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: profile.timezone })},{" "}
              {formatTimeInTz(new Date(a.scheduledAt), profile.timezone)} · {a.markers.map((m) => MARKERS[m]?.label ?? m).join(", ")}
            </div>
            <ol className="m-0 mt-1 pl-5 flex flex-col gap-1.5 text-[13px]">
              {a.checklist.map((c, i) => (
                <li key={i}>
                  <span className="text-muted">From {new Date(c.from).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: profile.timezone })}: </span>
                  {c.text}
                  {c.source && <span className="block text-[11px] text-faint">{c.source}</span>}
                </li>
              ))}
            </ol>
            <p className="m-0 mt-1 text-[12px] text-muted">Follow the lab&apos;s and your doctor&apos;s instructions where they differ.</p>
          </div>
        ))}
      </section>

      <details className="card mx-3 mt-3 px-4 py-3">
        <summary className="text-[15px] font-semibold cursor-pointer">Timing rules ({rules.length})</summary>
        <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-2.5">
          {rules.map((r) => (
            <li key={r.key} className="text-[13px]">
              <span className="text-fg">
                {r.subjectTag} → {r.objectTag}: {r.direction === "after" ? "at least" : "keep"} {r.minGapMin >= 60 ? `${r.minGapMin / 60} h` : `${r.minGapMin} min`}
                {r.direction === "either" ? " apart" : " after"}
              </span>
              <span className="block text-muted">{r.message}</span>
              <span className="block text-[11px] text-faint">{r.citation}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
