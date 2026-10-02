"use client";

import { useState } from "react";
import FormShell from "./form-shell";
import { cn } from "@/lib/utils";

/*
 * Ported from FormSquat.dc.html. Shin, thigh and torso are nested groups
 * rotating about ankle, knee and hip on a 4 s loop: 2 s down to the depth
 * stop (band lights up), short pause, 1 s drive up. Reduced motion shows the
 * bottom position with the band lit.
 */
const CSS = `
.fs-shin,.fs-thigh,.fs-torso{transform-box:view-box;animation-duration:4s;animation-iteration-count:infinite;animation-timing-function:ease-in-out}
.fs-shin{transform-origin:250px 250px;animation-name:fsShin}
.fs-thigh{transform-origin:250px 170px;animation-name:fsThigh}
.fs-torso{transform-origin:190px 110px;animation-name:fsTorso}
.fs-band{animation:fsBand 4s infinite linear}
.fs-bandlabel{animation:fsBandLabel 4s infinite linear}
@keyframes fsShin{0%{transform:rotate(0deg)}50%,62%{transform:rotate(45deg)}85%,100%{transform:rotate(0deg)}}
@keyframes fsThigh{0%{transform:rotate(0deg)}50%,62%{transform:rotate(-61deg)}85%,100%{transform:rotate(0deg)}}
@keyframes fsTorso{0%{transform:rotate(0deg)}50%,62%{transform:rotate(16deg)}85%,100%{transform:rotate(0deg)}}
@keyframes fsBand{0%,44%{stroke:#4A5059}49%,63%{stroke:#FFB547}68%,100%{stroke:#4A5059}}
@keyframes fsBandLabel{0%,44%{fill:#A3A7AE}49%,63%{fill:#FFB547}68%,100%{fill:#A3A7AE}}
@media (prefers-reduced-motion: reduce){
.fs-shin,.fs-thigh,.fs-torso,.fs-band,.fs-bandlabel{animation:none}
.fs-shin{transform:rotate(45deg)}
.fs-thigh{transform:rotate(-61deg)}
.fs-torso{transform:rotate(16deg)}
.fs-band{stroke:#FFB547}
.fs-bandlabel{fill:#FFB547}
}
`;

const CUES = [
  "Feet mid–high, shoulder width",
  "Knees track 2nd–3rd toe",
  "2 s down to the stop, heels flat",
  "Drive up, no bounce off the bottom",
];

type Knee = "none" | "twinge" | "pain";
const KNEE_OPTIONS: Array<{ key: Knee; label: string }> = [
  { key: "none", label: "No pain" },
  { key: "twinge", label: "Twinge" },
  { key: "pain", label: "Pain" },
];

export default function FormSquat({
  title,
  subtitle,
  load,
  upFrom,
}: {
  title: string;
  subtitle: string;
  /** "90 kg" — omitted when there is no working weight yet. */
  load: string | null;
  /** "up from 50" when the history shows an earlier, lighter top set. */
  upFrom: string | null;
}) {
  const [knee, setKnee] = useState<Knee | null>(null);
  const joined = [upFrom, "own the depth"].filter(Boolean).join(" · ");
  const note = load ? joined : joined.charAt(0).toUpperCase() + joined.slice(1);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <FormShell title={title} subtitle={subtitle}>
        <section
          aria-label="Animated side view of a machine squat rep"
          className="bg-surface border border-line rounded-2xl flex flex-col overflow-hidden"
        >
          <div className="h-10 flex items-center justify-between gap-3 px-3.5">
            <div className="flex items-baseline gap-2 min-w-0">
              {load && <span className="font-display font-bold text-xl tabular-nums shrink-0">{load}</span>}
              <span className="text-[11px] text-muted truncate">{note}</span>
            </div>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-[10px] tracking-[0.08em] text-muted uppercase">Tempo</span>
              <span className="font-display font-bold text-[26px] text-accent leading-none">2-0-1</span>
            </div>
          </div>
          <svg
            viewBox="0 0 358 300"
            className="block w-full h-auto max-h-[330px]"
            role="img"
            aria-label="Figure lowers for two seconds to the depth stop, then drives up"
          >
            {/* machine: ground, posts, rails */}
            <line x1="16" y1="282" x2="342" y2="282" stroke="#2C3036" strokeWidth="2" />
            <line x1="72" y1="34" x2="72" y2="282" stroke="#3A3F47" strokeWidth="6" strokeLinecap="round" />
            <line x1="212" y1="176" x2="212" y2="282" stroke="#3A3F47" strokeWidth="6" strokeLinecap="round" />
            <line x1="60" y1="22" x2="215" y2="177" stroke="#A3A7AE" strokeWidth="3" strokeLinecap="round" />
            <line x1="55" y1="27" x2="210" y2="182" stroke="#3A3F47" strokeWidth="3" strokeLinecap="round" />
            {/* platform */}
            <rect x="222" y="258" width="84" height="10" rx="3" fill="#3A3F47" />
            <rect x="258" y="268" width="10" height="14" fill="#3A3F47" />
            {/* depth stop band */}
            <line className="fs-band" x1="184" y1="175" x2="212" y2="147" stroke="#4A5059" strokeWidth="8" strokeLinecap="round" />
            <line x1="166" y1="181" x2="184" y2="178" stroke="#3A3F47" strokeWidth="1.5" />
            <text className="fs-bandlabel font-display" x="104" y="186" fill="#A3A7AE" fontWeight="700" fontSize="12" letterSpacing="1">
              DEPTH STOP
            </text>
            {/* foot (fixed) */}
            <line x1="238" y1="253" x2="286" y2="254" stroke="#F2F0EA" strokeWidth="9" strokeLinecap="round" />
            {/* kinematic chain: shin > thigh > torso */}
            <g className="fs-shin">
              <g className="fs-thigh">
                <g className="fs-torso">
                  <line x1="187" y1="127" x2="102" y2="42" stroke="#3A3F47" strokeWidth="12" strokeLinecap="round" />
                  <line x1="152" y1="115" x2="128" y2="91" stroke="#A3A7AE" strokeWidth="9" strokeLinecap="round" />
                  <line x1="140" y1="103" x2="151" y2="92" stroke="#A3A7AE" strokeWidth="5" strokeLinecap="round" />
                  <line x1="190" y1="110" x2="123" y2="43" stroke="#F2F0EA" strokeWidth="15" strokeLinecap="round" />
                  <circle cx="108" cy="28" r="12" fill="#F2F0EA" />
                  <line x1="121" y1="35" x2="136" y2="20" stroke="#A3A7AE" strokeWidth="8" strokeLinecap="round" />
                  <path d="M123 43 L150 64 L148 37" fill="none" stroke="#F2F0EA" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="148" cy="34" r="4.5" fill="#A3A7AE" />
                </g>
                <line x1="250" y1="170" x2="190" y2="110" stroke="#F2F0EA" strokeWidth="13" strokeLinecap="round" />
              </g>
              <line x1="250" y1="250" x2="250" y2="170" stroke="#F2F0EA" strokeWidth="11" strokeLinecap="round" />
            </g>
          </svg>
        </section>

        <ol aria-label="Form cues" className="m-0 p-0 list-none grid grid-cols-2 gap-2">
          {CUES.map((c, i) => (
            <li
              key={c}
              className="bg-surface border border-line rounded-xl px-2.5 py-2 flex gap-2 items-start min-h-[46px]"
            >
              <span className="font-display font-bold text-lg text-accent leading-[1.1]" aria-hidden="true">
                {i + 1}
              </span>
              <span className="text-[12.5px] leading-[1.3]">{c}</span>
            </li>
          ))}
        </ol>

        <section aria-labelledby="fs-knee-title" className="bg-surface border border-line rounded-2xl p-3 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 id="fs-knee-title" className="m-0 font-display font-bold text-lg tracking-[0.02em]">
              Knee check
            </h2>
            <span className="text-[11px] text-muted">Front view</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-2 rounded-xl px-2 py-1.5 flex items-center gap-2">
              <svg width="48" height="60" viewBox="0 0 56 70" aria-hidden="true" className="shrink-0">
                <line x1="12" y1="36" x2="12" y2="64" stroke="#7FB2FF" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="44" y1="36" x2="44" y2="64" stroke="#7FB2FF" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="18" y1="8" x2="38" y2="8" stroke="#F2F0EA" strokeWidth="6" strokeLinecap="round" />
                <path d="M18 8 L12 36 L13 62" fill="none" stroke="#F2F0EA" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M38 8 L44 36 L43 62" fill="none" stroke="#F2F0EA" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="13" y1="63" x2="6" y2="66" stroke="#F2F0EA" strokeWidth="4" strokeLinecap="round" />
                <line x1="43" y1="63" x2="50" y2="66" stroke="#F2F0EA" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="flex items-center gap-1 text-xs font-semibold text-info">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="#7FB2FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Tracks out
                </span>
                <span className="text-[11px] text-muted leading-[1.25]">Knee over 2nd–3rd toe</span>
              </div>
            </div>
            <div className="bg-surface-2 rounded-xl px-2 py-1.5 flex items-center gap-2">
              <svg width="48" height="60" viewBox="0 0 56 70" aria-hidden="true" className="shrink-0">
                <line x1="18" y1="8" x2="38" y2="8" stroke="#FF7A6B" strokeWidth="6" strokeLinecap="round" />
                <path d="M18 8 L25 36 L12 62" fill="none" stroke="#FF7A6B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M38 8 L31 36 L44 62" fill="none" stroke="#FF7A6B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="63" x2="5" y2="66" stroke="#FF7A6B" strokeWidth="4" strokeLinecap="round" />
                <line x1="44" y1="63" x2="51" y2="66" stroke="#FF7A6B" strokeWidth="4" strokeLinecap="round" />
                <path d="M8 36 L18 36 M15 33 L18 36 L15 39" fill="none" stroke="#FF7A6B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M48 36 L38 36 M41 33 L38 36 L41 39" fill="none" stroke="#FF7A6B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="#FF7A6B" strokeWidth="2.2" strokeLinecap="round" /></svg>
                  Caving in
                </span>
                <span className="text-[11px] text-muted leading-[1.25]">Fault: knees collapse inward</span>
              </div>
            </div>
          </div>
          <div role="group" aria-labelledby="fs-knee-depth" className="flex flex-col gap-1.5">
            <span id="fs-knee-depth" className="text-xs text-muted">
              Knee at depth
            </span>
            <div className="grid grid-cols-3 gap-2">
              {KNEE_OPTIONS.map((o) => {
                const on = knee === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setKnee(on ? null : o.key)}
                    className={cn(
                      "min-h-[44px] rounded-[10px] border text-[13px] font-medium transition-colors",
                      on
                        ? o.key === "pain"
                          ? "bg-danger-bg border-danger text-danger"
                          : "bg-line border-line-strong text-fg"
                        : "bg-surface-2 border-line hover:bg-line",
                      !on && o.key === "pain" && "text-danger"
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p
              aria-live="polite"
              className={cn("m-0 text-[11.5px]", knee === "pain" ? "text-danger-text font-medium" : "text-muted")}
            >
              {knee === "pain"
                ? "Stop the set. Swap to Leg Press — primary quad compound — and tell your PT."
                : "Pain → swap to Leg Press, primary quad compound"}
            </p>
          </div>
        </section>
      </FormShell>
    </>
  );
}
