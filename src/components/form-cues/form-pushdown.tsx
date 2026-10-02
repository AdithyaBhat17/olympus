import FormShell from "./form-shell";

/*
 * Ported from FormPushdown.dc.html. Two synced panels on a 3 s loop: a side
 * view where only the forearm rotates about a pinned elbow (the cable
 * follows), and a wrist lens where the fault ghost (wrist bent to the pinky
 * side) flashes at the bottom while the rope ends split. A progress bar
 * tracks press / hold / 2 s return. Reduced motion shows the bottom position.
 */
const CSS = `
.pd-fa{transform-box:fill-box;transform-origin:50% 0;animation:pdFa 3s linear infinite}
@keyframes pdFa{0%{transform:rotate(-100deg)}6%{transform:rotate(-75deg)}12%{transform:rotate(-50deg)}18%{transform:rotate(-25deg)}23%,33%{transform:rotate(0deg)}50%{transform:rotate(-25deg)}67%{transform:rotate(-50deg)}84%{transform:rotate(-75deg)}100%{transform:rotate(-100deg)}}
.pd-cab{transform-box:fill-box;transform-origin:100% 0;animation:pdCab 3s linear infinite}
@keyframes pdCab{0%,100%{transform:rotate(-13.6deg) scale(.569)}6%,84%{transform:rotate(-15.1deg) scale(.699)}12%,67%{transform:rotate(-12.1deg) scale(.824)}18%,50%{transform:rotate(-6.7deg) scale(.928)}23%,33%{transform:rotate(0deg) scale(1)}}
.pd-ghost{opacity:0;animation:pdGhost 3s linear infinite}
@keyframes pdGhost{0%,18%{opacity:0}23%,33%{opacity:.95}40%,100%{opacity:0}}
.pd-capL{animation:pdCapL 3s linear infinite}
@keyframes pdCapL{0%,16%{transform:translateX(0)}23%,33%{transform:translateX(-7px)}45%,100%{transform:translateX(0)}}
.pd-capR{animation:pdCapR 3s linear infinite}
@keyframes pdCapR{0%,16%{transform:translateX(0)}23%,33%{transform:translateX(7px)}45%,100%{transform:translateX(0)}}
.pd-stL{transform-box:fill-box;transform-origin:100% 0;animation:pdStL 3s linear infinite}
@keyframes pdStL{0%,16%{transform:rotate(0deg)}23%,33%{transform:rotate(9deg)}45%,100%{transform:rotate(0deg)}}
.pd-stR{transform-box:fill-box;transform-origin:0 0;animation:pdStR 3s linear infinite}
@keyframes pdStR{0%,16%{transform:rotate(0deg)}23%,33%{transform:rotate(-9deg)}45%,100%{transform:rotate(0deg)}}
.pd-ph{transform-origin:0 50%;animation:pdPh 3s linear infinite}
@keyframes pdPh{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion: reduce){
.pd-fa,.pd-cab,.pd-ghost,.pd-capL,.pd-capR,.pd-stL,.pd-stR,.pd-ph{animation:none !important}
.pd-fa{transform:rotate(0deg)}
.pd-cab{transform:none}
.pd-ghost{opacity:.95}
.pd-capL{transform:translateX(-7px)}
.pd-capR{transform:translateX(7px)}
.pd-stL{transform:rotate(9deg)}
.pd-stR{transform:rotate(-9deg)}
.pd-ph{transform:scaleX(.33)}
}
`;

const CUES: Array<[string, string]> = [
  ["Thumbs up, wrists stacked.", "Knuckles in line with forearm; never bend to the pinky side."],
  ["Elbows pinned at your sides.", "Only the forearm moves."],
  ["Split slightly at the bottom.", "Hands move apart; wrists don't twist."],
  ["2-second return, torso still.", "Slight forward lean, no body-english."],
];

export default function FormPushdown({
  title,
  subtitle,
  prohibited,
  region,
}: {
  title: string;
  subtitle: string;
  /** Pushdown variants the athlete's wrist constraint blocks. */
  prohibited: string[];
  /** "wrist" — the region the prohibited list protects. */
  region: string | null;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <FormShell
        title={title}
        subtitle={subtitle}
        aside={
          <div className="shrink-0 flex items-center gap-[5px] h-[26px] px-[9px] rounded-[13px] bg-surface-2 border border-line text-[11px] font-medium text-info whitespace-nowrap">
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="#7FB2FF" strokeWidth="1.4" /><line x1="6" y1="5.2" x2="6" y2="8.8" stroke="#7FB2FF" strokeWidth="1.4" strokeLinecap="round" /><circle cx="6" cy="3.4" r=".8" fill="#7FB2FF" /></svg>
            Run last · after chest
          </div>
        }
      >
        <div
          role="img"
          aria-label="Animated rope pushdown: elbow stays fixed while the forearm presses down, the rope ends split slightly at the bottom, hold, then a slow two-second return. The wrist alignment line stays straight throughout."
          className="bg-surface border border-line rounded-2xl p-2.5 flex flex-col gap-2"
        >
          <div className="grid grid-cols-2 gap-2">
            {/* Side view */}
            <div className="bg-bg rounded-xl border border-line flex flex-col overflow-hidden">
              <div className="flex justify-between items-center px-2 pt-1.5 font-display font-semibold text-xs tracking-[1px] text-muted">
                <span>SIDE</span>
                <span className="flex items-center gap-1 text-accent tracking-[.4px]">
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" fill="#FFB547" /></svg>
                  ELBOW FIXED
                </span>
              </div>
              <svg viewBox="0 0 170 262" className="block w-full h-auto" aria-hidden="true">
                {/* floor */}
                <line x1="8" y1="255" x2="166" y2="255" stroke="#2C3036" strokeWidth="1.5" />
                {/* cable column */}
                <rect x="153" y="12" width="12" height="243" rx="2" fill="#202327" stroke="#2C3036" strokeWidth="1" />
                <rect x="155" y="214" width="8" height="8" fill="#2C3036" />
                <rect x="155" y="224" width="8" height="8" fill="#2C3036" />
                <rect x="155" y="234" width="8" height="8" fill="#2C3036" />
                <rect x="155" y="244" width="8" height="8" fill="#2C3036" />
                <circle cx="150" cy="20" r="6" fill="#17191C" stroke="#A3A7AE" strokeWidth="1.5" />
                {/* cable */}
                <g className="pd-cab">
                  <line x1="150" y1="20" x2="80" y2="182" stroke="#A3A7AE" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                </g>
                {/* figure */}
                <g fill="none" stroke="#F2F0EA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="66" y1="150" x2="58" y2="202" strokeOpacity=".45" />
                  <line x1="58" y1="202" x2="54" y2="252" strokeOpacity=".45" />
                  <line x1="66" y1="150" x2="73" y2="201" />
                  <line x1="73" y1="201" x2="69" y2="252" />
                  <line x1="69" y1="252" x2="84" y2="253" />
                  <line x1="78" y1="74" x2="66" y2="150" />
                  <line x1="75" y1="61" x2="77" y2="72" />
                  <circle cx="72" cy="46" r="12" />
                  <line x1="78" y1="76" x2="80" y2="128" />
                </g>
                {/* forearm (rotates about elbow) */}
                <g className="pd-fa">
                  <rect x="50" y="128" width="60" height="72" fill="none" stroke="none" />
                  <line x1="80" y1="128" x2="80" y2="175" stroke="#F2F0EA" strokeWidth="3" strokeLinecap="round" />
                  <rect x="75" y="174" width="10" height="12" rx="3.5" fill="#0E0F11" stroke="#F2F0EA" strokeWidth="2" />
                  <line x1="80" y1="186" x2="77" y2="198" stroke="#A3A7AE" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="80" y1="186" x2="83" y2="198" stroke="#A3A7AE" strokeWidth="2.5" strokeLinecap="round" />
                </g>
                {/* elbow pin */}
                <circle cx="80" cy="128" r="9.5" fill="none" stroke="#FFB547" strokeWidth="1.3" strokeOpacity=".55" />
                <circle cx="80" cy="128" r="4.5" fill="#FFB547" />
              </svg>
            </div>

            {/* Wrist lens */}
            <div className="bg-bg rounded-xl border border-line flex flex-col overflow-hidden">
              <div className="flex justify-between items-center px-2 pt-1.5 font-display font-semibold text-xs tracking-[1px] text-muted">
                <span>WRIST LENS</span>
                <span className="flex items-center gap-1 text-info tracking-[.4px]">
                  <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><line x1="1" y1="4" x2="11" y2="4" stroke="#7FB2FF" strokeWidth="2" strokeLinecap="round" /></svg>
                  STRAIGHT
                </span>
              </div>
              <svg viewBox="0 0 150 262" className="block w-full h-auto" aria-hidden="true">
                {/* upper arm stub */}
                <line x1="31" y1="0" x2="35" y2="40" stroke="#F2F0EA" strokeWidth="17" strokeLinecap="round" />
                <line x1="31" y1="0" x2="35" y2="40" stroke="#202327" strokeWidth="13.5" strokeLinecap="round" />
                {/* fault ghost: wrist bent to pinky side */}
                <g className="pd-ghost">
                  <g transform="rotate(24 35 118)">
                    <rect x="27" y="116" width="16" height="24" rx="6" fill="none" stroke="#FF7A6B" strokeWidth="1.5" strokeDasharray="3 2.5" />
                    <line x1="35" y1="112" x2="35" y2="150" stroke="#FF7A6B" strokeWidth="1.4" strokeDasharray="3 2.5" />
                  </g>
                  <circle cx="14" cy="148" r="7" fill="#FF7A6B" />
                  <line x1="11" y1="145" x2="17" y2="151" stroke="#0E0F11" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="17" y1="145" x2="11" y2="151" stroke="#0E0F11" strokeWidth="1.8" strokeLinecap="round" />
                </g>
                {/* forearm + fist (rotates about elbow) */}
                <g className="pd-fa">
                  <rect x="5" y="40" width="60" height="118" fill="none" stroke="none" />
                  <line x1="35" y1="40" x2="35" y2="116" stroke="#F2F0EA" strokeWidth="17" strokeLinecap="round" />
                  <line x1="35" y1="40" x2="35" y2="116" stroke="#202327" strokeWidth="13.5" strokeLinecap="round" />
                  <line x1="35" y1="140" x2="35" y2="154" stroke="#A3A7AE" strokeWidth="3.5" strokeLinecap="round" />
                  <rect x="27" y="116" width="16" height="25" rx="6" fill="#202327" stroke="#F2F0EA" strokeWidth="1.6" />
                  <rect x="40" y="113" width="7" height="13" rx="3.5" fill="#202327" stroke="#F2F0EA" strokeWidth="1.4" />
                  <line x1="35" y1="34" x2="35" y2="156" stroke="#7FB2FF" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="35" cy="128" r="2.2" fill="#7FB2FF" />
                </g>
                <circle cx="35" cy="40" r="4.5" fill="#FFB547" />
                {/* split inset (front view) */}
                <line x1="8" y1="176" x2="142" y2="176" stroke="#2C3036" strokeWidth="1" />
                <text x="75" y="192" textAnchor="middle" fill="#A3A7AE" className="font-display" fontWeight="600" fontSize="10.5" letterSpacing=".8">
                  FRONT · SPLIT, NO TWIST
                </text>
                <circle cx="75" cy="204" r="3.2" fill="#A3A7AE" />
                <g className="pd-stL"><line x1="75" y1="204" x2="62" y2="236" stroke="#A3A7AE" strokeWidth="2.5" strokeLinecap="round" /></g>
                <g className="pd-stR"><line x1="75" y1="204" x2="88" y2="236" stroke="#A3A7AE" strokeWidth="2.5" strokeLinecap="round" /></g>
                <g className="pd-capL">
                  <rect x="56" y="234" width="12" height="18" rx="5" fill="#202327" stroke="#F2F0EA" strokeWidth="1.5" />
                  <line x1="62" y1="230" x2="62" y2="256" stroke="#7FB2FF" strokeWidth="1.6" strokeLinecap="round" />
                </g>
                <g className="pd-capR">
                  <rect x="82" y="234" width="12" height="18" rx="5" fill="#202327" stroke="#F2F0EA" strokeWidth="1.5" />
                  <line x1="88" y1="230" x2="88" y2="256" stroke="#7FB2FF" strokeWidth="1.6" strokeLinecap="round" />
                </g>
                <path d="M44 243 L36 243 M39 240 L36 243 L39 246" fill="none" stroke="#FFB547" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M106 243 L114 243 M111 240 L114 243 L111 246" fill="none" stroke="#FFB547" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Phase timeline (3 s loop) */}
          <div className="flex flex-col gap-1 flex-none" aria-hidden="true">
            <div className="relative h-1 rounded-sm bg-line overflow-hidden">
              <div className="pd-ph absolute inset-0 bg-accent rounded-sm" />
            </div>
            <div className="flex font-display font-semibold text-xs tracking-[.6px] text-muted">
              <span style={{ flex: 23 }}>PRESS</span>
              <span style={{ flex: 10 }}>HOLD</span>
              <span style={{ flex: 67 }} className="text-right">
                RETURN · <span className="text-fg">2 S</span>
              </span>
            </div>
          </div>
        </div>

        <ol className="m-0 p-0 list-none flex flex-col gap-[9px]">
          {CUES.map(([lead, rest], i) => (
            <li key={lead} className="flex gap-2.5 items-start">
              <span
                aria-hidden="true"
                className="flex-none w-6 h-6 rounded-[7px] bg-surface-2 border border-line flex items-center justify-center font-display font-bold text-[15px] text-accent"
              >
                {i + 1}
              </span>
              <span className="text-[13px] leading-[1.35]">
                <b className="font-semibold">{lead}</b> <span className="text-muted">{rest}</span>
              </span>
            </li>
          ))}
        </ol>

        {prohibited.length > 0 && (
          <section aria-labelledby="pd-prohibited" className="flex flex-col gap-[7px]">
            <h2 id="pd-prohibited" className="m-0 font-display font-semibold text-[13px] tracking-[1px] text-muted uppercase">
              Prohibited for your {region ?? "wrist"}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {prohibited.map((p) => (
                <div key={p} className="bg-surface border border-line rounded-xl p-2.5 flex gap-2 items-start">
                  <svg width="20" height="20" viewBox="0 0 20 20" className="flex-none" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#FF7A6B" /><line x1="6.5" y1="6.5" x2="13.5" y2="13.5" stroke="#1A0B08" strokeWidth="2" strokeLinecap="round" /><line x1="13.5" y1="6.5" x2="6.5" y2="13.5" stroke="#1A0B08" strokeWidth="2" strokeLinecap="round" /></svg>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-semibold leading-[1.25]">{p}</span>
                    <span className="text-[11.5px] text-muted leading-[1.3]">Use: rope / neutral handles</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </FormShell>
    </>
  );
}
