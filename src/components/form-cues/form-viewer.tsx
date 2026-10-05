"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FormEngine, type UiState } from "./engine";
import { FORM_DEFS } from "./defs";
import type { FormCueId } from "./cue-ids";
import BackLink from "./back-link";

const BASE_W = 366;
const BASE_H = 392;

/**
 * 3D form cue: orbitable stage (three.js, 2D canvas fallback), play / scrub /
 * ½× speed, phase strip, DO / AVOID cues. Rendering pauses when the stage is
 * off-screen or the tab is hidden.
 */
export default function FormViewer({
  cue,
  title,
  eyebrow,
}: {
  cue: FormCueId;
  title: string;
  /** "FORM, 3D, 100 KG, STRAPS" */
  eyebrow: string;
}) {
  const { make, copy } = FORM_DEFS[cue];
  const stageRef = useRef<HTMLDivElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FormEngine | null>(null);
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const [ui, setUi] = useState<UiState>({ phase: 0, phaseText: "", read: "", prog: 0 });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState(0);
  const [hint, setHint] = useState(true);
  const [def, setDef] = useState<FormEngine["D"] | null>(null);

  // Size the stage to the column (366×392 at 390 wide), once.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const W = Math.round(Math.min(480, el.clientWidth || BASE_W));
    setSize({ W, H: Math.round((W * BASE_H) / BASE_W) });
  }, []);

  useEffect(() => {
    if (!size || !ovRef.current) return;
    const eng = new FormEngine(make, size, setUi);
    engineRef.current = eng;
    eng.attach(ovRef.current, glRef.current);
    setDef(eng.D);
    setView(eng.D.v0 || 0);
    setPlaying(eng.playing);

    // Battery: only render while the stage is on screen and the tab is visible.
    let onScreen = true;
    const sync = () => (onScreen && document.visibilityState === "visible" ? eng.start() : eng.stop());
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(stageRef.current!);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      eng.destroy();
      engineRef.current = null;
    };
  }, [size, make]);

  const eng = engineRef.current;
  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    eng?.setPlaying(next);
  };
  const toggleSpeed = () => {
    const s = speed === 1 ? 0.5 : 1;
    setSpeed(s);
    eng?.setSpeed(s);
  };

  return (
    <div className="flex flex-col pb-[calc(env(safe-area-inset-bottom)+120px)]">
      <header className="page-top px-3 flex items-center gap-3">
        <BackLink aria-label="Back" className="btn-round">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </BackLink>
        <div className="flex flex-col gap-[3px] min-w-0">
          <span className="text-[11px] text-accent truncate">{eyebrow}</span>
          <h1 className="m-0 num text-[32px] leading-[0.95] truncate">{title}</h1>
        </div>
      </header>

      <div
        ref={stageRef}
        className="relative mx-3 mt-3.5 rounded-[28px] overflow-hidden shadow-[inset_0_0_0_1px_#232327] bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,rgba(255,106,43,.13),rgba(255,106,43,0)_70%),#141416]"
        style={{ height: size?.H ?? BASE_H }}
      >
        {size && (
          <>
            <canvas
              ref={glRef}
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{ width: size.W, height: size.H }}
            />
            <canvas
              ref={ovRef}
              role="img"
              aria-label={copy.aria}
              className="relative block cursor-grab active:cursor-grabbing"
              style={{ width: size.W, height: size.H, touchAction: "none" }}
              onPointerDown={(e) => {
                engineRef.current?.pointerDown(e.clientX, e.clientY);
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  /* capture unsupported */
                }
              }}
              onPointerMove={(e) => {
                if (engineRef.current?.pointerMove(e.clientX, e.clientY) && hint) setHint(false);
              }}
              onPointerUp={() => engineRef.current?.pointerUp()}
              onPointerCancel={() => engineRef.current?.pointerUp()}
            />
          </>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2 h-[30px] pl-2.5 pr-3 rounded-full bg-[rgba(10,10,11,.66)] text-xs font-semibold pointer-events-none" aria-live="polite">
          <span className="w-[7px] h-[7px] rounded-full bg-accent animate-live-dot" />
          {ui.phaseText || def?.phases[0].n}
        </div>
        <div className="absolute right-3.5 top-2.5 flex flex-col items-end pointer-events-none">
          <span className="text-[10px] text-muted">{def?.readLabel}</span>
          <span className="num text-[34px] text-info">{ui.read}</span>
        </div>
        {def && (
          <div role="group" aria-label="Camera angle" className="absolute left-2.5 bottom-2.5 flex gap-0.5 p-[3px] rounded-[14px] bg-[rgba(10,10,11,.66)]">
            {def.views.map((v, i) => (
              <button
                key={v.n}
                type="button"
                aria-pressed={view === i}
                onClick={() => {
                  setView(i);
                  engineRef.current?.pickView(i);
                }}
                className={cn("h-11 px-3 rounded-[11px] text-xs font-semibold", view === i ? "bg-fg text-bg" : "text-fg-2")}
              >
                {v.n}
              </button>
            ))}
          </div>
        )}
        {hint && (
          <span className="absolute right-3 bottom-[18px] flex items-center gap-1.5 text-xs text-fg-2 pointer-events-none animate-rise [animation-delay:800ms]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 4 0 0 0 18 0" />
              <path d="M18 9l3 3-3 3" />
            </svg>
            Drag to orbit
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mx-3 mt-2.5 py-1.5 pl-1.5 pr-2 rounded-3xl bg-surface shadow-[inset_0_0_0_1px_#232327]">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="w-11 h-11 shrink-0 rounded-full bg-fg text-bg flex items-center justify-center"
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="4" width="5" height="16" rx="1.5" />
              <rect x="14" y="4" width="5" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={ui.prog}
          aria-label="Scrub through the rep"
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setPlaying(false);
            setUi((u) => ({ ...u, prog: v }));
            engineRef.current?.scrubTo(v / 1000);
          }}
          className="scrub flex-1 min-w-0"
          style={{ backgroundSize: `${(ui.prog / 10).toFixed(1)}% 100%, auto` }}
        />
        <button
          type="button"
          onClick={toggleSpeed}
          aria-label={`Playback speed ${speed === 1 ? "normal" : "half"}`}
          className="h-11 min-w-[52px] shrink-0 rounded-full bg-surface-3 num text-[16px]"
        >
          {speed === 1 ? "1×" : "½×"}
        </button>
      </div>

      {def && (
        <ol aria-label="Rep phases" className="m-0 p-0 list-none flex gap-1 mx-3 mt-2.5">
          {def.phases.map((p, i) => (
            <li
              key={p.n}
              aria-current={ui.phase === i ? "step" : undefined}
              className={cn(
                "flex-1 min-w-0 h-[34px] rounded-xl px-1.5 text-xs font-semibold flex items-center justify-center truncate transition-colors duration-200",
                ui.phase === i ? "bg-accent text-accent-ink" : "bg-surface text-muted shadow-[inset_0_0_0_1px_#232327]"
              )}
            >
              {p.n}
            </li>
          ))}
        </ol>
      )}

      <section aria-label="Coaching cues" className="mx-3 mt-3 p-4 rounded-[24px] bg-surface shadow-[inset_0_0_0_1px_#232327] grid grid-cols-2 gap-3.5">
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] text-accent">DO</span>
          {copy.do.map((c) => (
            <span key={c} className="text-[13px] leading-[1.4] text-[#E4E2DC]">
              {c}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] text-danger-soft">AVOID</span>
          {copy.avoid.map((c) => (
            <span key={c} className="text-[13px] leading-[1.4] text-[#E4E2DC]">
              {c}
            </span>
          ))}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pt-5 pb-[calc(env(safe-area-inset-bottom)+16px)] bg-[linear-gradient(180deg,rgba(10,10,11,0),#0A0A0B_35%)]">
        <div className="max-w-lg mx-auto">
          <BackLink className="btn-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Got it — back to set
          </BackLink>
        </div>
      </div>
    </div>
  );
}
