import Link from "next/link";
import { cn } from "@/lib/utils";
import { PlayIcon } from "@/components/session/icons";
import { StartSessionButton } from "./start-session-button";

export interface NextSessionItem {
  key: string;
  name: string;
  /** "47 cw", "85", "21.1/side" */
  load: string | null;
  /** "↑5" when the open load is heavier than last top set. */
  up: string | null;
  straps: boolean;
}

export interface NextSessionData {
  sessionType: string;
  rotation: readonly string[];
  /** Plan title; null when there's no plan yet. */
  title: string | null;
  exerciseCount: number;
  estMin: number;
  /** "16:40" when the plan was pushed by Claude. */
  fromPtAt: string | null;
  /** "Sat 3 Oct" when the plan isn't for today. */
  dayLabel: string | null;
  warnings: string[];
  items: NextSessionItem[];
  more: string[];
  cta:
    | { kind: "resume"; href: string }
    | { kind: "plan"; planId: string }
    | { kind: "rotation" };
}

export function NextSessionCard({ data }: { data: NextSessionData }) {
  const { sessionType: type } = data;
  const noPlan = data.title == null;

  return (
    <section aria-labelledby="next-h" className="mx-5 mt-4 p-5 bg-surface rounded-2xl flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <span className="text-[13px] font-semibold tracking-[0.06em] uppercase text-accent">Next in rotation</span>
        <div className="flex gap-1.5" role="img" aria-label={`Rotation ${data.rotation.join(", ")} — ${type} is next`}>
          {data.rotation.map((r) => (
            <span
              key={r}
              aria-hidden
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-semibold",
                r === type ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
              )}
            >
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 id="next-h" className="m-0 font-display font-bold text-4xl leading-none">
            Session {type}
          </h2>
          {data.fromPtAt && (
            <span className="text-xs font-semibold text-info border border-info-line bg-info-bg rounded-md px-2 py-0.5">
              From your PT · {data.fromPtAt}
            </span>
          )}
          {data.dayLabel && (
            <span className="text-xs text-muted border border-line rounded-md px-2 py-0.5">{data.dayLabel}</span>
          )}
        </div>
        {noPlan ? (
          <p className="m-0 text-base text-fg-2 leading-snug">
            No plan from your PT yet. Ask Claude to programme it, or repeat your last Session {type}.
          </p>
        ) : (
          <div className="text-base text-fg-2">
            {data.title}
            {data.exerciseCount > 0 &&
              ` · ${data.exerciseCount} exercise${data.exerciseCount === 1 ? "" : "s"}`}
            {data.estMin > 0 && ` · ~${data.estMin} min`}
          </div>
        )}
      </div>

      {data.warnings.length > 0 && (
        <details className="group -mt-1 rounded-xl bg-surface-2 px-3">
          <summary className="min-h-11 flex items-center gap-2 text-[13px] text-muted cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90">
              <path d="M9 6l6 6-6 6" />
            </svg>
            {data.warnings.length} note{data.warnings.length === 1 ? "" : "s"} from validation
          </summary>
          <ul className="m-0 pb-3 pl-6 list-disc text-[13px] text-fg-2 leading-[1.45] flex flex-col gap-1.5">
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {data.items.length > 0 && (
        <ol className="m-0 p-0 list-none flex flex-col border-t border-line">
          {data.items.map((it) => (
            <li key={it.key} className="flex justify-between items-center gap-3 py-2.5 border-b border-line">
              <span className="min-w-0">
                {it.name}
                {it.straps && <span className="chip ml-1 text-info border-info-line">straps</span>}
              </span>
              {it.load != null && (
                <span
                  className={cn(
                    "font-display text-lg tabular-nums whitespace-nowrap",
                    it.up ? "text-fg" : "text-muted"
                  )}
                >
                  {it.load}
                  {it.up && <span className="text-info"> {it.up}</span>}
                </span>
              )}
            </li>
          ))}
          {data.more.length > 0 && (
            <li className="flex justify-between items-center gap-3 py-2.5 text-muted">
              <span className="whitespace-nowrap">+ {data.more.length} more</span>
              <span className="text-[13px] truncate">{data.more.join(" · ")}</span>
            </li>
          )}
        </ol>
      )}

      {data.cta.kind === "resume" ? (
        <Link href={data.cta.href} className="btn-primary">
          <PlayIcon />
          Resume Session {type}
        </Link>
      ) : data.cta.kind === "plan" ? (
        <StartSessionButton kind="plan" planId={data.cta.planId} label={`Start Session ${type}`} />
      ) : (
        <StartSessionButton kind="rotation" sessionType={type} label={`Start from last Session ${type}`} />
      )}

      {noPlan && data.cta.kind !== "resume" && (
        <Link href="/log" className="btn-ghost w-full text-muted">
          Log a past session manually
        </Link>
      )}
    </section>
  );
}
