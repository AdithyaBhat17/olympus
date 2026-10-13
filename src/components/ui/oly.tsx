import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Oly, the Olympus mountain. The app's mascot: a snowcapped peak (the mountain
 * on the app icon, standing up) with a face, built from the Coral palette.
 *
 *   lift  - barbell overhead. Login, "your move" moments.
 *   cheer - arms up, confetti. Finished sessions, clean sessions.
 *   rest  - eyes shut, Zzz. Empty states.
 *
 * tone "coral" is for light surfaces. "chalk" is for the coloured session blocks
 * (.kind-*), where a coral mountain would vanish.
 *
 * Keep ios/Olympus/Core/Oly.swift in step with the geometry here.
 */
export type OlyPose = "lift" | "cheer" | "rest";
export type OlyTone = "coral" | "chalk";

// Colours come from the palette in globals.css (:root), like the rest of the app.
const rgb = (name: string) => `rgb(var(--${name}))`;

const TONES = {
  coral: {
    body: rgb("coral"),
    limb: rgb("coral-deep"),
    snow: rgb("surface-3"), // darker than the cream page, so the cap still reads on it
    plateBig: rgb("berry"),
    plateSmall: rgb("apricot"),
    shadow: 0.12,
  },
  chalk: {
    body: rgb("surface"),
    limb: rgb("surface-3"),
    snow: rgb("white"),
    plateBig: rgb("fg-2"),
    plateSmall: rgb("bg"),
    shadow: 0.18,
  },
} as const;

const INK = rgb("fg");
const MOUTH = rgb("apricot-ink");
const BLUSH = rgb("apricot");
const EYE_SHINE = rgb("bg");
const TONGUE = "#E67D62"; // the .kind-a --k3 tint; --k3 only exists inside a .kind-* block
const LINE = { fill: "none", stroke: INK, strokeWidth: 8, strokeLinecap: "round" } as const;
const MOUNTAIN = "M64 396 Q22 396 34 354 C54 290 96 214 154 152 Q200 98 246 152 C304 214 346 290 366 354 Q378 396 336 396 Z";
const SNOW = "M60 100 L340 100 L340 196 L300 210 L274 184 L250 214 L226 186 L200 216 L176 188 L150 212 L126 190 L60 200Z";

export function Oly({
  pose = "lift",
  tone = "coral",
  size = 200,
  className,
}: {
  pose?: OlyPose;
  tone?: OlyTone;
  /** Width in px; the height follows (400:420). */
  size?: number;
  className?: string;
}) {
  const t = TONES[tone];
  const clip = useId();
  const limb = { fill: "none", stroke: t.limb, strokeWidth: 24, strokeLinecap: "round" } as const;

  return (
    <svg
      viewBox="0 0 400 420"
      width={size}
      height={Math.round((size * 420) / 400)}
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <ellipse cx="200" cy="404" rx="130" ry="9" fill={INK} opacity={t.shadow} />

      {pose === "lift" && (
        <>
          <path d="M122 266 Q92 168 140 84" {...limb} />
          <path d="M278 266 Q308 168 260 84" {...limb} />
          <rect x="50" y="62" width="300" height="18" rx="9" fill={INK} />
          <rect x="66" y="14" width="26" height="114" rx="12" fill={t.plateBig} />
          <rect x="96" y="30" width="18" height="82" rx="9" fill={t.plateSmall} />
          <rect x="308" y="14" width="26" height="114" rx="12" fill={t.plateBig} />
          <rect x="286" y="30" width="18" height="82" rx="9" fill={t.plateSmall} />
          <circle cx="140" cy="72" r="17" fill={t.limb} />
          <circle cx="260" cy="72" r="17" fill={t.limb} />
        </>
      )}
      {pose === "cheer" && (
        <>
          <path d="M112 300 Q44 270 52 188" {...limb} />
          <path d="M288 300 Q356 270 348 188" {...limb} />
          <circle cx="52" cy="176" r="20" fill={t.limb} />
          <circle cx="348" cy="176" r="20" fill={t.limb} />
          <circle cx="104" cy="70" r="9" fill={t.plateSmall} />
          <circle cx="302" cy="52" r="11" fill={t.plateBig} />
          <rect x="196" y="22" width="16" height="16" rx="5" fill={t.plateSmall} transform="rotate(25 204 30)" />
          <circle cx="58" cy="104" r="7" fill={t.plateBig} />
          <circle cx="352" cy="110" r="8" fill={t.plateSmall} />
        </>
      )}

      <clipPath id={clip}>
        <path d={MOUNTAIN} />
      </clipPath>
      <path d={MOUNTAIN} fill={t.body} />
      <path d={SNOW} fill={t.snow} clipPath={`url(#${clip})`} />

      {pose === "rest" ? (
        <>
          <path d="M150 268 Q164 282 178 268" {...LINE} />
          <path d="M222 268 Q236 282 250 268" {...LINE} />
        </>
      ) : (
        <>
          <ellipse cx="164" cy="270" rx="14" ry="19" fill={INK} />
          <ellipse cx="236" cy="270" rx="14" ry="19" fill={INK} />
          <circle cx="169" cy="263" r="5" fill={EYE_SHINE} />
          <circle cx="241" cy="263" r="5" fill={EYE_SHINE} />
        </>
      )}
      <circle cx="130" cy="304" r="17" fill={BLUSH} opacity={0.85} />
      <circle cx="270" cy="304" r="17" fill={BLUSH} opacity={0.85} />
      {pose === "rest" ? (
        <path d="M186 306 Q200 318 214 306" {...LINE} />
      ) : (
        <>
          <path d="M176 298 Q200 340 224 298 Z" fill={MOUTH} stroke={MOUTH} strokeWidth="8" strokeLinejoin="round" />
          <path d="M188 318 Q200 310 212 318 Q200 330 188 318Z" fill={TONGUE} />
        </>
      )}

      {pose === "rest" && (
        <g fill={t.limb} fontFamily="ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif" fontWeight="800">
          <text x="290" y="92" fontSize="44">z</text>
          <text x="326" y="58" fontSize="32">z</text>
          <text x="352" y="32" fontSize="22">z</text>
        </g>
      )}
    </svg>
  );
}
