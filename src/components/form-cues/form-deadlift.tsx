import FormShell from "./form-shell";

/*
 * Ported from FormDeadlift.dc.html. The figure is a kinematic chain
 * (shin > thigh > torso > arm), each joint rotated by its own keyframes on a
 * shared 3.2 s loop. Phase chips and captions are offset with negative delays
 * so exactly one is lit per quarter of the loop.
 */
const CSS = `
.dl-j{transform-box:view-box}
.dl-shin{transform-origin:172px 300px;transform:rotate(12deg);animation:dlShin 3.2s ease-in-out infinite}
.dl-thigh{transform-origin:172px 240px;transform:rotate(-90deg);animation:dlThigh 3.2s ease-in-out infinite}
.dl-torso{transform-origin:172px 176px;transform:rotate(134deg);animation:dlTorso 3.2s ease-in-out infinite}
.dl-arm{transform-origin:172px 104px;transform:rotate(-56deg);animation:dlArm 3.2s ease-in-out infinite}
@keyframes dlShin{0%,22%{transform:rotate(12deg)}38%{transform:rotate(4deg)}52%,74%{transform:rotate(0deg)}88%{transform:rotate(4deg)}100%{transform:rotate(12deg)}}
@keyframes dlThigh{0%,22%{transform:rotate(-90deg)}38%{transform:rotate(-56deg)}52%,74%{transform:rotate(0deg)}88%{transform:rotate(-56deg)}100%{transform:rotate(-90deg)}}
@keyframes dlTorso{0%,22%{transform:rotate(134deg)}38%{transform:rotate(101.8deg)}52%,74%{transform:rotate(0deg)}88%{transform:rotate(101.8deg)}100%{transform:rotate(134deg)}}
@keyframes dlArm{0%,22%{transform:rotate(-56deg)}38%{transform:rotate(-49.8deg)}52%,74%{transform:rotate(-6.3deg)}88%{transform:rotate(-49.8deg)}100%{transform:rotate(-56deg)}}
.dl-ph{background:#17191C;color:#A3A7AE;border:1px solid #2C3036;animation:dlPhase 3.2s linear infinite}
@keyframes dlPhase{0%,24%{background:#FFB547;color:#1A1300;border-color:#FFB547}25%,100%{background:#17191C;color:#A3A7AE;border-color:#2C3036}}
.dl-cap{opacity:0;animation:dlCap 3.2s linear infinite}
@keyframes dlCap{0%{opacity:0}3%,22%{opacity:1}25%,100%{opacity:0}}
.dl-d1{animation-delay:0s}
.dl-d2{animation-delay:-2.4s}
.dl-d3{animation-delay:-1.6s}
.dl-d4{animation-delay:-0.8s}
@media (prefers-reduced-motion: reduce){
.dl-shin,.dl-thigh,.dl-torso,.dl-arm,.dl-ph,.dl-cap{animation:none}
.dl-ph.dl-d1{background:#FFB547;color:#1A1300;border-color:#FFB547}
.dl-cap.dl-d1{opacity:1}
}
`;

const PHASES = ["Setup", "Pull", "Lockout", "Lower"] as const;
const CAPTIONS = [
  "Bar over midfoot · shins to the bar · hips back",
  "Push the floor · drag it up the legs",
  "Squeeze glutes · stand tall, no lean back",
  "Hips back first · bar stays on the legs",
];

export default function FormDeadlift({
  title,
  subtitle,
  load,
}: {
  title: string;
  subtitle: string;
  /** "85 kg × 5" — omitted when there is no working weight yet. */
  load: string | null;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <FormShell
        title={title}
        subtitle={subtitle}
        bordered
        aside={
          load ? (
            <div className="shrink-0 font-display text-base font-semibold text-accent bg-surface-2 border border-line rounded-full px-3 py-1 tabular-nums">
              {load}
            </div>
          ) : null
        }
      >
        <section
          aria-label="Deadlift form animation"
          className="bg-surface border border-line rounded-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center gap-4 px-3.5 pt-3 text-xs text-muted flex-wrap">
            <span className="flex items-center gap-1.5">
              <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="#FFB547" strokeWidth="2" strokeDasharray="4 3" /></svg>
              Bar path
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="#7FB2FF" strokeWidth="2.5" /></svg>
              Spine line
            </span>
            <span className="ml-auto text-[11px] tracking-[0.6px] uppercase">Straps · double overhand</span>
          </div>

          <svg
            viewBox="40 56 286 262"
            className="block w-full h-auto max-h-[320px]"
            role="img"
            aria-label="Side view figure: setup with bar over midfoot, pull with bar dragging up the legs, lockout standing tall, controlled lower"
          >
            <line x1="40" y1="305" x2="326" y2="305" stroke="#2C3036" strokeWidth="2" />
            <line x1="181" y1="304" x2="181" y2="150" stroke="#FFB547" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
            <path d="M176 312 L181 307 L186 312" fill="none" stroke="#FFB547" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <text x="190" y="315" fill="#FFB547" fontSize="9" className="font-sans">midfoot</text>
            <line x1="160" y1="301" x2="202" y2="301" stroke="#F2F0EA" strokeWidth="7" strokeLinecap="round" />

            <g className="dl-j dl-shin">
              <line x1="172" y1="300" x2="172" y2="240" stroke="#F2F0EA" strokeWidth="10" strokeLinecap="round" />
              <g className="dl-j dl-thigh">
                <line x1="172" y1="240" x2="172" y2="176" stroke="#F2F0EA" strokeWidth="11" strokeLinecap="round" />
                <g className="dl-j dl-torso">
                  <line x1="172" y1="176" x2="172" y2="104" stroke="#F2F0EA" strokeWidth="14" strokeLinecap="round" />
                  <circle cx="172" cy="89" r="11" fill="#F2F0EA" />
                  <line x1="162" y1="186" x2="162" y2="94" stroke="#7FB2FF" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="162" cy="186" r="2.8" fill="#7FB2FF" />
                  <circle cx="162" cy="94" r="2.8" fill="#7FB2FF" />
                  <g className="dl-j dl-arm">
                    <line x1="172" y1="104" x2="172" y2="186" stroke="#F2F0EA" strokeWidth="8" strokeLinecap="round" />
                    <circle cx="172" cy="186" r="30" fill="#A3A7AE" fillOpacity="0.14" stroke="#A3A7AE" strokeWidth="3" />
                    <circle cx="172" cy="186" r="18" fill="none" stroke="#A3A7AE" strokeOpacity="0.45" strokeWidth="1.5" />
                    <circle cx="172" cy="186" r="5" fill="#A3A7AE" />
                    <circle cx="172" cy="186" r="2" fill="#0E0F11" />
                  </g>
                </g>
              </g>
            </g>
          </svg>

          <div className="relative h-[38px] border-t border-line shrink-0" aria-hidden="true">
            {CAPTIONS.map((c, i) => (
              <div
                key={c}
                className={`dl-cap dl-d${i + 1} absolute inset-0 flex items-center px-3.5 font-display text-[17px] font-semibold truncate`}
              >
                {c}
              </div>
            ))}
          </div>
        </section>

        <ol aria-label="Phases" className="grid grid-cols-4 gap-1.5 m-0 p-0 list-none">
          {PHASES.map((p, i) => (
            <li
              key={p}
              className={`dl-ph dl-d${i + 1} h-11 rounded-[10px] flex items-center justify-center gap-[5px] font-display text-base font-bold tracking-[0.3px]`}
            >
              <span className="opacity-60">{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>

        <section aria-labelledby="dl-cues" className="flex flex-col gap-2">
          <h2 id="dl-cues" className="mt-0.5 font-display text-[19px] font-bold">
            Cues
          </h2>
          <ol className="m-0 p-0 list-none bg-surface border border-line rounded-[14px] flex flex-col">
            <Cue n={1} title="Bar over midfoot, shins to the bar">
              Strap in, hands just outside the shins, wrists straight. No mixed grip.
            </Cue>
            <Cue n={2} title="Hinge, don't squat. Back flat">
              Hips back and above knees. Keep the <span className="text-info">spine line</span> straight, head in line.
            </Cue>
            <Cue n={3} title="Push the floor, drag the bar up">
              Bar touches shins and thighs the whole way. <span className="text-accent">Vertical path.</span>
            </Cue>
            <Cue n={4} title="Lock out with glutes" last>
              Stand tall and squeeze. No leaning back. Lower hips-first.
            </Cue>
          </ol>
        </section>

        <section aria-labelledby="dl-faults" className="flex flex-col gap-2">
          <h2 id="dl-faults" className="mt-0.5 font-display text-[19px] font-bold">
            Common faults
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Fault label="Rounded lower back">
              <line x1="20" y1="91" x2="130" y2="91" stroke="#2C3036" strokeWidth="1.5" />
              <line x1="52" y1="89" x2="72" y2="89" stroke="#F2F0EA" strokeWidth="4" strokeLinecap="round" />
              <circle cx="68" cy="79" r="11" fill="#A3A7AE" fillOpacity="0.14" stroke="#A3A7AE" strokeWidth="2" />
              <line x1="58" y1="88" x2="64" y2="70" stroke="#F2F0EA" strokeWidth="5" strokeLinecap="round" />
              <line x1="64" y1="70" x2="36" y2="64" stroke="#F2F0EA" strokeWidth="5.5" strokeLinecap="round" />
              <line x1="36" y1="64" x2="80" y2="46" stroke="#7FB2FF" strokeWidth="1.5" strokeDasharray="3 3" />
              <path d="M36 64 Q44 28 80 46" fill="none" stroke="#FF7A6B" strokeWidth="6" strokeLinecap="round" />
              <circle cx="88" cy="53" r="6" fill="#F2F0EA" />
              <line x1="80" y1="46" x2="69" y2="79" stroke="#F2F0EA" strokeWidth="4" strokeLinecap="round" />
              <circle cx="68" cy="79" r="2.5" fill="#A3A7AE" />
            </Fault>
            <Fault label="Bar drifts off the legs">
              <line x1="20" y1="91" x2="130" y2="91" stroke="#2C3036" strokeWidth="1.5" />
              <line x1="63" y1="90" x2="63" y2="40" stroke="#FFB547" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="52" y1="89" x2="72" y2="89" stroke="#F2F0EA" strokeWidth="4" strokeLinecap="round" />
              <circle cx="100" cy="76" r="11" fill="#A3A7AE" fillOpacity="0.14" stroke="#A3A7AE" strokeWidth="2" />
              <line x1="58" y1="88" x2="62" y2="68" stroke="#F2F0EA" strokeWidth="5" strokeLinecap="round" />
              <line x1="62" y1="68" x2="36" y2="58" stroke="#F2F0EA" strokeWidth="5.5" strokeLinecap="round" />
              <line x1="36" y1="58" x2="86" y2="40" stroke="#F2F0EA" strokeWidth="6" strokeLinecap="round" />
              <circle cx="95" cy="36" r="6" fill="#F2F0EA" />
              <line x1="86" y1="40" x2="99" y2="75" stroke="#F2F0EA" strokeWidth="4" strokeLinecap="round" />
              <circle cx="100" cy="76" r="2.5" fill="#A3A7AE" />
              <line x1="67" y1="76" x2="86" y2="76" stroke="#FF7A6B" strokeWidth="2" strokeLinecap="round" />
              <path d="M82 72 L87 76 L82 80" fill="none" stroke="#FF7A6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </Fault>
          </div>
        </section>
      </FormShell>
    </>
  );
}

function Cue({
  n,
  title,
  last,
  children,
}: {
  n: number;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={`flex gap-3 px-3.5 py-3 ${last ? "" : "border-b border-line"}`}>
      <span className="font-display text-2xl font-bold text-accent w-4 leading-none" aria-hidden="true">
        {n}
      </span>
      <div className="flex flex-col gap-0.5">
        <strong className="text-[15px] font-semibold">{title}</strong>
        <span className="text-[13px] text-muted">{children}</span>
      </div>
    </li>
  );
}

function Fault({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative bg-surface border border-line rounded-xl p-2.5 flex flex-col gap-1.5">
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 w-[22px] h-[22px] rounded-full bg-danger flex items-center justify-center"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="#1A1300" strokeWidth="2" strokeLinecap="round" /></svg>
      </span>
      <svg viewBox="20 22 110 74" className="block w-full h-[76px]" aria-hidden="true">
        {children}
      </svg>
      <div className="flex flex-col gap-px">
        <span className="font-display text-xs font-bold tracking-[0.8px] text-danger uppercase">Don&apos;t</span>
        <span className="text-[13px] font-medium">{label}</span>
      </div>
    </div>
  );
}
