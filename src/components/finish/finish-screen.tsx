"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renderSessionMarkdown, type ExportSession } from "@/domain/export";
import type { SessionCatch } from "@/domain/flags";
import { deleteSession } from "@/lib/actions";
import { mutate } from "@/lib/offline/mutate";
import { hapticTick } from "@/lib/haptics";
import { saveRest } from "@/components/session/timers";
import { cn, kindClass } from "@/lib/utils";
import { Confetti } from "@/components/ui/confetti";

interface FinishScreenProps {
  sessionId: string;
  status: "IN_PROGRESS" | "DONE";
  sentAt: string | null;
  eyebrow: string;
  /** "Session B" */
  label: string;
  /** A, B, C or null: picks the colour block. */
  sessionType: string | null;
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
    tile: "bg-info-bg text-info",
    label: "Progress",
  },
  underload: { mark: "!", tile: "bg-accent-bg text-accent num text-[17px] font-black", label: "Underloaded" },
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


export default function FinishScreen({
  sessionId,
  status,
  sentAt,
  eyebrow,
  label,
  sessionType,
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

  async function handleDelete() {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    try {
      await deleteSession(sessionId);
      toast.success("Session deleted");
      router.push("/history");
      router.refresh();
    } catch {
      toast.error("Couldn't delete. Check your connection.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy. Try Save instead.");
    }
  }

  const time = elapsed != null ? formatDuration(elapsed) : null;
  const hasPr = catches.some((c) => c.kind === "pr");
  // Sent and no longer live: the bottom bar offers "Back to Today".
  const done = sent && !live;

  return (
    <div className={cn(kindClass(sessionType), "flex flex-col pb-[calc(env(safe-area-inset-bottom)+180px)]")}>
      <div className="relative overflow-hidden bg-k text-k-on pb-12">
        {live && <Confetti />}
        <header className="relative page-top px-4 flex justify-between items-center">
          <Link
            href={live ? `/session/${sessionId}` : "/history"}
            aria-label={live ? "Back to session" : "Back to log"}
            className="btn-round on-k"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <span className="text-[15px] font-semibold opacity-90">{eyebrow}</span>
          <span className="w-11" aria-hidden />
        </header>

        <div className="relative px-6 pt-6 flex flex-col gap-1.5">
          <h1 className="m-0 text-[56px] font-extrabold leading-[58px] tracking-[-1px] animate-pop-in">
            {live ? (hasPr ? "New PR!" : "Crushed it.") : sent ? "Sent." : "Done."}
          </h1>
          <p className="arrive arrive-1 m-0 text-[17px] opacity-90">
            {label}. {summaryLine(catches)}
          </p>
        </div>

        <section aria-label="Summary" className="relative mt-6 px-5 grid grid-cols-3 justify-items-center gap-3">
          {[
            { value: time ? time.value : "—", unit: time?.unit, label: "time" },
            { value: String(workingSets), unit: null, label: "work sets" },
            { value: avgRpe != null ? avgRpe.toFixed(1) : "—", unit: null, label: "avg RPE" },
          ].map((t, i) => (
            <span
              key={t.label}
              className="w-[104px] h-[104px] rounded-full bg-white flex flex-col items-center justify-center animate-pop-in"
              style={{ animationDelay: `${150 + i * 100}ms` }}
            >
              <span className="num text-[30px] text-k-text">
                {t.value}
                {t.unit && <span className="text-[15px]"> {t.unit}</span>}
              </span>
              <span className="text-[13px] font-bold text-muted">{t.label}</span>
            </span>
          ))}
        </section>
      </div>

      <div className="sheet-over pt-2">
      <section aria-labelledby="c-h" className="arrive arrive-3 mx-3 mt-[22px]">
        <h2 id="c-h" className="section-label mx-2 mb-2.5">
          What your PT will see
        </h2>
        {catches.length === 0 ? (
          <p className="m-0 px-5 py-4 rounded-3xl bg-surface text-[15px] text-muted">
            Nothing flagged. Clean session.
          </p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {catches.map((c, i) => {
              const s = CATCH[c.kind];
              return (
                <li
                  key={i}
                  className="flex gap-3 items-center px-4 py-3.5 rounded-3xl bg-surface animate-rise"
                  style={{ animationDelay: `${300 + i * 60}ms` }}
                >
                  <span className={cn("w-10 h-10 shrink-0 rounded-full flex items-center justify-center", s.tile)} aria-hidden>
                    {s.mark}
                  </span>
                  <span className="flex-1 text-[15px] leading-5">
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
          className="w-full rounded-[28px] bg-surface text-fg text-[17px] leading-6 px-5 py-4 resize-none outline-none focus:ring-[2.5px] focus:ring-inset focus:ring-k placeholder:text-faint"
        />
        <p className="mx-2 mt-2 mb-0 text-[13px] text-muted">Autosaved as you type, works offline</p>
      </section>

      <details className="mx-3 mt-[22px] group">
        <summary className="section-label mx-2 min-h-11 flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90">
            <path d="M9 6l6 6-6 6" />
          </svg>
          {live ? "Lift Log entry" : "Export & delete"}
          <span className="text-[13px] font-normal text-muted truncate">{fileName}</span>
        </summary>
        <pre className="m-0 mt-1 p-4 rounded-[24px] bg-surface text-[13px] leading-[1.6] text-fg-2 whitespace-pre-wrap break-words max-h-[360px] overflow-auto font-sans">
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
        {!live && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="mt-2 w-full h-12 rounded-full bg-surface text-danger text-[15px] font-bold"
          >
            Delete session
          </button>
        )}
      </details>

      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pt-6 pb-[calc(env(safe-area-inset-bottom)+20px)] bg-gradient-to-b from-bg/0 via-bg to-bg">
        <div className="max-w-lg mx-auto flex flex-col gap-2">
          {done ? (
            <Link href="/today" className="btn-chalk">
              Back to Today
            </Link>
          ) : (
            <button type="button" onClick={() => void complete("sendToPT")} disabled={leaving} className="btn-k">
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
              className="h-12 rounded-full text-fg-2 font-bold text-[15px] disabled:opacity-50"
            >
              Finish without sending
            </button>
          ) : (
            sent && (
              <button
                type="button"
                onClick={() => void complete("sendToPT")}
                disabled={leaving}
                className="h-12 rounded-full text-fg-2 font-bold text-[15px]"
              >
                Send again with these notes
              </button>
            )
          )}
          {!live && !sent && (
            <Link href="/today" className="h-12 rounded-full text-fg-2 font-bold text-[15px] flex items-center justify-center">
              Back to Today
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
