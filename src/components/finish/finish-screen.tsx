"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renderSessionMarkdown, type ExportSession } from "@/domain/export";
import type { SessionCatch } from "@/domain/flags";
import { mutate } from "@/lib/offline/mutate";
import { hapticTick } from "@/lib/haptics";
import { saveRest } from "@/components/session/timers";
import { cn } from "@/lib/utils";

interface FinishScreenProps {
  sessionId: string;
  status: "IN_PROGRESS" | "DONE";
  sentAt: string | null;
  eyebrow: string;
  /** "Session B" */
  label: string;
  startedAt: string | null;
  /** Known server-side once the session is finished; null while it is live. */
  durationSec: number | null;
  workingSets: number;
  avgRpe: number | null;
  catches: SessionCatch[];
  initialNotes: string;
  fileName: string;
  exportSession: ExportSession;
}

/** "41:07" under an hour, "1:01 h" after. */
function formatDuration(sec: number): { value: string; unit: string | null } {
  const s = Math.max(0, Math.floor(sec));
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return { value: `${m}:${String(s % 60).padStart(2, "0")}`, unit: null };
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return { value: `${h}:${String(m).padStart(2, "0")}`, unit: "h" };
}

const CATCH: Record<SessionCatch["kind"], { mark: React.ReactNode; tile: string; label: string }> = {
  pr: {
    mark: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M6 11l6-6 6 6" />
      </svg>
    ),
    tile: "bg-[rgba(140,200,255,.12)] text-info",
    label: "Progress",
  },
  underload: { mark: "!", tile: "bg-[rgba(255,106,43,.14)] text-accent num text-[17px] font-black", label: "Underloaded" },
  blocked: { mark: "×", tile: "bg-danger-bg text-danger num text-[18px]", label: "Blocked" },
  recovery: { mark: "×", tile: "bg-danger-bg text-danger num text-[18px]", label: "Recovery" },
};

function summaryLine(catches: SessionCatch[]): string {
  const prs = catches.filter((c) => c.kind === "pr").length;
  const other = catches.length - prs;
  const n = (k: number, one: string, many: string) => (k === 0 ? null : k === 1 ? one : `${k} ${many}`);
  const parts = [n(prs, "One PR", "PRs"), n(other, "one thing for your PT to look at", "things for your PT to look at")].filter(Boolean);
  if (!parts.length) return "Clean session. Nothing flagged.";
  const s = parts.join(", ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

const SPARKS = [
  { dx: "-120px", dy: "-30px", c: "#FF6A2B", s: 6 },
  { dx: "110px", dy: "-44px", c: "#8CC8FF", s: 6 },
  { dx: "-80px", dy: "40px", c: "#F5F3EE", s: 4 },
  { dx: "140px", dy: "24px", c: "#FF6A2B", s: 6 },
  { dx: "-150px", dy: "6px", c: "#8CC8FF", s: 4 },
  { dx: "60px", dy: "-70px", c: "#F5F3EE", s: 4 },
];

export default function FinishScreen({
  sessionId,
  status,
  sentAt,
  eyebrow,
  label,
  startedAt,
  durationSec,
  workingSets,
  avgRpe,
  catches,
  initialNotes,
  fileName,
  exportSession,
}: FinishScreenProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const savedNotes = useRef(initialNotes);
  const [sent, setSent] = useState(!!sentAt);
  const [leaving, setLeaving] = useState(false);
  const live = status === "IN_PROGRESS";

  // Elapsed time for a live session is clock-dependent: compute after mount.
  const [elapsed, setElapsed] = useState<number | null>(durationSec);
  useEffect(() => {
    if (durationSec != null || !startedAt) {
      setElapsed(durationSec);
      return;
    }
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.round((Date.now() - start) / 1000));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [durationSec, startedAt]);

  const notesOrNull = () => notes.trim() || null;

  // Autosave as you type (debounced), through the offline outbox.
  useEffect(() => {
    if (notes === savedNotes.current) return;
    const t = window.setTimeout(() => {
      const value = notes;
      void mutate({ kind: "saveNotes", sessionId, notes: value.trim() || null }, {
        onOk: () => {
          savedNotes.current = value;
        },
      });
      savedNotes.current = value;
    }, 700);
    return () => window.clearTimeout(t);
  }, [notes, sessionId]);

  const markdown = useMemo(
    () => renderSessionMarkdown({ ...exportSession, notes: notes.trim() || null }),
    [exportSession, notes]
  );

  /** Optimistic: leave for Today straight away; the outbox delivers it. */
  const complete = async (kind: "sendToPT" | "finish") => {
    hapticTick();
    setLeaving(true);
    if (kind === "sendToPT") setSent(true);
    const res = await mutate({ kind, sessionId, notes: notesOrNull() }, {
      rollback: () => {
        setLeaving(false);
        if (kind === "sendToPT") setSent(!!sentAt);
      },
    });
    if (res.status === "rejected") return;
    saveRest(sessionId, null);
    savedNotes.current = notes;
    if (res.status === "ok") toast.success(kind === "sendToPT" ? "Sent to your PT" : "Session finished");
    router.push("/today");
    router.refresh();
  };

  async function handleSave() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    try {
      const file = new File([blob], fileName, { type: "text/markdown" });
      const coarse = window.matchMedia?.("(pointer: coarse)").matches;
      if (coarse && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: fileName });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
    } catch {
      // File constructor unsupported: fall through.
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Saved ${fileName}`);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — try Save instead");
    }
  }

  const time = elapsed != null ? formatDuration(elapsed) : null;
  const tile = "px-3 py-3.5 rounded-[20px] bg-surface shadow-[inset_0_0_0_1px_#232327] flex flex-col gap-1 min-w-0";

  return (
    <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+180px)]">
      <header className="page-top px-3 flex justify-between items-center">
        <Link
          href={live ? `/session/${sessionId}` : "/history"}
          aria-label={live ? "Back to session" : "Back to log"}
          className="btn-round"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="eyebrow">{eyebrow}</span>
        <span className="w-11" aria-hidden />
      </header>

      <div className="relative flex flex-col items-center pt-7 px-5 pb-2 text-center">
        <div aria-hidden className="absolute inset-x-0 top-10 h-[120px]">
          {SPARKS.map((p, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full animate-spark"
              style={{ width: p.s, height: p.s, background: p.c, ["--dx" as string]: p.dx, ["--dy" as string]: p.dy }}
            />
          ))}
        </div>
        <span className="w-16 h-16 rounded-[22px] bg-accent text-accent-ink flex items-center justify-center animate-stamp">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className="arrive arrive-1 mt-[18px] mb-0 num text-[52px] leading-[0.92]">
          {label}
          {live ? ", done." : sent ? ", sent." : ", done."}
        </h1>
        <p className="arrive arrive-2 mt-2 mb-0 text-fg-2">{summaryLine(catches)}</p>
      </div>

      <section aria-label="Summary" className="arrive arrive-2 grid grid-cols-3 gap-1.5 mx-3 mt-[18px]">
        <div className={tile}>
          <span className="tile-label">Time</span>
          <span className="num text-[30px]">
            {time ? time.value : "—"}
            {time?.unit && <span className="text-base text-muted"> {time.unit}</span>}
          </span>
        </div>
        <div className={tile}>
          <span className="tile-label">Work sets</span>
          <span className="num text-[30px]">{workingSets}</span>
        </div>
        <div className={tile}>
          <span className="tile-label">Avg RPE</span>
          <span className="num text-[30px]">{avgRpe != null ? avgRpe.toFixed(1) : "—"}</span>
        </div>
      </section>

      <section aria-labelledby="c-h" className="arrive arrive-3 mx-3 mt-[22px]">
        <h2 id="c-h" className="section-label mx-2 mb-2.5">
          What your PT will see
        </h2>
        {catches.length === 0 ? (
          <p className="m-0 px-4 py-3.5 rounded-[18px] bg-surface shadow-[inset_0_0_0_1px_#232327] text-sm text-muted">
            Nothing flagged. Clean session.
          </p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {catches.map((c, i) => {
              const s = CATCH[c.kind];
              return (
                <li key={i} className="flex gap-3 items-center px-4 py-3.5 rounded-[18px] bg-surface shadow-[inset_0_0_0_1px_#232327]">
                  <span className={cn("w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center", s.tile)} aria-hidden>
                    {s.mark}
                  </span>
                  <span className="flex-1 text-sm leading-[1.4]">
                    <span className="sr-only">{s.label}: </span>
                    {c.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="arrive arrive-4 mx-3 mt-[22px]">
        <label htmlFor="notes" className="section-label block mx-2 mb-2.5">
          Notes for your PT
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Wrist felt fine, deadlift grip slipped on set 3…"
          className="w-full rounded-[18px] bg-surface shadow-[inset_0_0_0_1px_#232327] text-fg text-[16px] leading-[1.45] px-4 py-3.5 resize-none outline-none focus:shadow-[inset_0_0_0_1.5px_#FF6A2B] placeholder:text-faint"
        />
        <p className="mx-2 mt-2 mb-0 text-xs text-faint">Autosaved as you type · works offline</p>
      </section>

      <details className="mx-3 mt-[22px] group">
        <summary className="section-label mx-2 min-h-11 flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90">
            <path d="M9 6l6 6-6 6" />
          </svg>
          Lift Log entry
          <span className="font-mono text-[11px] normal-case tracking-normal text-faint truncate">{fileName}</span>
        </summary>
        <pre className="m-0 mt-1 p-3.5 rounded-[18px] bg-surface-sunk font-mono text-[11px] leading-[1.6] text-fg-2 whitespace-pre-wrap break-words max-h-[360px] overflow-auto">
          {markdown}
        </pre>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          <button type="button" onClick={handleSave} className="btn-ghost">
            Save to Obsidian
          </button>
          <button type="button" onClick={handleCopy} className="btn-ghost">
            Copy text
          </button>
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pt-6 pb-[calc(env(safe-area-inset-bottom)+20px)] bg-[linear-gradient(180deg,rgba(10,10,11,0),#0A0A0B_30%)]">
        <div className="max-w-lg mx-auto flex flex-col gap-2">
          {sent && !live ? (
            <Link href="/today" className="btn-chalk">
              Back to Today
            </Link>
          ) : (
            <button type="button" onClick={() => void complete("sendToPT")} disabled={leaving} className="btn-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
              </svg>
              {sent ? "Send again with these notes" : "Send to PT"}
            </button>
          )}
          {live ? (
            <button
              type="button"
              onClick={() => void complete("finish")}
              disabled={leaving}
              className="h-12 rounded-2xl text-fg-2 font-medium text-[15px] disabled:opacity-50"
            >
              Finish without sending
            </button>
          ) : (
            sent && (
              <button
                type="button"
                onClick={() => void complete("sendToPT")}
                disabled={leaving}
                className="h-12 rounded-2xl text-fg-2 font-medium text-[15px]"
              >
                Send again with these notes
              </button>
            )
          )}
          {!live && !sent && (
            <Link href="/today" className="h-12 rounded-2xl text-fg-2 font-medium text-[15px] flex items-center justify-center">
              Back to Today
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
