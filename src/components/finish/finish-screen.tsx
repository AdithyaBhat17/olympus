"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renderSessionMarkdown, type ExportSession } from "@/domain/export";
import type { SessionCatch } from "@/domain/flags";
import {
  finishSessionAction,
  saveSessionNotesAction,
  sendToPTAction,
} from "@/lib/liftlog-actions";
import { cn } from "@/lib/utils";

interface FinishScreenProps {
  sessionId: string;
  status: "IN_PROGRESS" | "DONE";
  sentAt: string | null;
  eyebrow: string;
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

const HEADER_PAD = "pt-[max(52px,calc(env(safe-area-inset-top)_+_12px))]";

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

const CATCH_STYLE: Record<SessionCatch["kind"], { mark: string; className: string; label: string }> = {
  pr: { mark: "↑", className: "text-info", label: "Progress" },
  underload: { mark: "!", className: "text-accent", label: "Warning" },
  blocked: { mark: "×", className: "text-danger-soft", label: "Problem" },
  recovery: { mark: "×", className: "text-danger-soft", label: "Problem" },
};

export default function FinishScreen({
  sessionId,
  status,
  sentAt,
  eyebrow,
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
  const [sending, startSending] = useTransition();
  const [finishing, startFinishing] = useTransition();
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

  const markdown = useMemo(
    () => renderSessionMarkdown({ ...exportSession, notes: notes.trim() || null }),
    [exportSession, notes]
  );

  const notesOrNull = () => notes.trim() || null;

  async function persistNotes() {
    if (notes === savedNotes.current) return;
    const res = await saveSessionNotesAction(sessionId, notesOrNull());
    if (res.ok) savedNotes.current = notes;
    else toast.error(res.error);
  }

  function handleSend() {
    startSending(async () => {
      const res = await sendToPTAction(sessionId, notesOrNull());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      savedNotes.current = notes;
      setSent(true);
      toast.success("Sent to your PT");
      router.refresh();
    });
  }

  function handleFinishOnly() {
    startFinishing(async () => {
      const res = await finishSessionAction(sessionId, notesOrNull());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      savedNotes.current = notes;
      toast.success("Session finished");
      router.refresh();
    });
  }

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
          // Fall through to a plain download.
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
      toast.error("Couldn't copy — select the text above instead");
    }
  }

  const time = elapsed != null ? formatDuration(elapsed) : null;

  return (
    <div className="flex flex-col pb-10">
      <header className={cn("px-4 flex flex-col gap-1", HEADER_PAD)}>
        <div className="flex items-center gap-1 -ml-2">
          <Link
            href={live ? `/session/${sessionId}` : "/history"}
            aria-label={live ? "Back to session" : "Back to log"}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-fg hover:bg-surface"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <span className="eyebrow font-normal">{eyebrow}</span>
        </div>
        <h1 className="px-1 font-display font-bold text-[44px] leading-none">
          {live ? "Finish session" : "Session done"}
        </h1>
      </header>

      <section aria-label="Summary" className="mx-4 mt-5 grid grid-cols-3 gap-2">
        <Tile label="Time">
          {time ? (
            <>
              {time.value}
              {time.unit && <span className="text-base text-muted font-medium"> {time.unit}</span>}
            </>
          ) : (
            "—"
          )}
        </Tile>
        <Tile label="Working sets">{workingSets}</Tile>
        <Tile label="Avg RPE">{avgRpe != null ? avgRpe.toFixed(1) : "—"}</Tile>
      </section>

      <section aria-labelledby="caught-title" className="card mx-4 mt-4 flex flex-col gap-3">
        <h2 id="caught-title" className="eyebrow">
          What the app caught
        </h2>
        {catches.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged. Clean session.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {catches.map((c, i) => {
              const s = CATCH_STYLE[c.kind];
              return (
                <li key={i} className="flex gap-2.5">
                  <span
                    className={cn("w-5 shrink-0 font-display text-lg font-bold leading-snug", s.className)}
                    aria-hidden="true"
                  >
                    {s.mark}
                  </span>
                  <span className="text-sm leading-[1.4]">
                    <span className="sr-only">{s.label}: </span>
                    {c.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mx-4 mt-4 flex flex-col gap-2">
        <label htmlFor="session-notes" className="eyebrow">
          Session notes
        </label>
        <textarea
          id="session-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={persistNotes}
          maxLength={2000}
          placeholder="Grip, energy, anything your PT should know"
          className="w-full rounded-xl border border-line bg-surface p-3 text-[15px] text-fg placeholder:text-faint resize-none focus:outline-none focus:border-accent"
        />
      </section>

      <section aria-labelledby="export-title" className="mx-4 mt-5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="export-title" className="eyebrow shrink-0">
            Lift Log entry
          </h2>
          <span className="font-mono text-[11px] text-muted truncate">{fileName}</span>
        </div>
        <pre className="m-0 p-3.5 rounded-xl bg-surface-sunk border border-line-soft font-mono text-[11px] leading-[1.6] text-fg-2 whitespace-pre-wrap break-words max-h-[360px] overflow-auto">
          {markdown}
        </pre>
      </section>

      <section className="mx-4 mt-4 flex flex-col gap-2">
        {sent ? (
          <div
            role="status"
            className="rounded-[14px] border border-info-line bg-info-bg px-4 py-3.5 flex items-start gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-info shrink-0 mt-0.5">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-semibold">Sent</span>
              <span className="text-sm text-muted">
                Claude can pull it with <code className="font-mono text-[13px] text-fg-2">get_sessions</code>.
              </span>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="self-start mt-1 min-h-[44px] -my-2 text-sm text-info underline-offset-4 hover:underline disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send again with these notes"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={handleSend} disabled={sending || finishing} className="btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4z" />
            </svg>
            {sending ? "Sending…" : "Send to PT (Claude)"}
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handleSave} className="btn-secondary">
            Save to Obsidian
          </button>
          <button type="button" onClick={handleCopy} className="btn-secondary">
            Copy text
          </button>
        </div>
        <p className="text-xs text-muted text-center leading-[1.4]">
          Send pushes via the LiftLog MCP. Copy is the fallback.
        </p>

        {live && !sent && (
          <button
            type="button"
            onClick={handleFinishOnly}
            disabled={finishing || sending}
            className="btn-ghost w-full mt-2 disabled:opacity-50"
          >
            {finishing ? "Finishing…" : "Finish without sending"}
          </button>
        )}

        {(sent || !live) && (
          <Link href="/today" className="btn-ghost w-full mt-2">
            Back to Today
          </Link>
        )}
      </section>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-surface flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-[28px] font-semibold leading-tight tabular-nums">{children}</span>
    </div>
  );
}
