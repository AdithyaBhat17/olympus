import type { Config } from "tailwindcss";

/**
 * Olympus "Coral" tokens — light, colour-blocked, Apple-native type.
 * System fonts only (SF Pro on Apple devices, SF Pro Rounded for numerals).
 *
 * Colour meaning is strict:
 *   accent (coral) = "your move" — primary CTA, active set, the check.
 *   info (berry)   = "from your PT" or "progress / up".
 *   k-*            = the current session type's colour block (.kind-a/b/c/cardio).
 */
// Colours live as "r g b" channels in globals.css so opacity modifiers keep working.
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Every colour comes from the palette in globals.css (:root), as "r g b" channels.
        bg: c("bg"),
        surface: c("surface"),
        "surface-2": c("surface-2"),
        "surface-3": c("surface-3"),
        "surface-sunk": c("surface-2"),
        sheet: c("bg"),
        key: c("surface-3"),
        "key-down": c("line-strong"),
        line: c("surface-3"),
        "line-soft": c("surface-2"),
        "line-strong": c("line-strong"),
        fg: c("fg"),
        "fg-2": c("fg-2"),
        muted: c("muted"),
        faint: c("faint"),
        apricot: { DEFAULT: c("apricot"), ink: c("apricot-ink") },
        // Session-type colour block, set by .kind-* on an ancestor.
        k: { DEFAULT: c("k"), on: c("k-on"), text: c("k-text"), 1: c("k1"), 2: c("k2"), 3: c("k3") },
        accent: {
          DEFAULT: c("coral"),
          ink: c("white"),
          bg: "rgb(var(--coral) / .12)",
          line: "rgb(var(--coral) / .35)",
          soft: c("coral-deep"),
        },
        // "From your PT" / progress: berry.
        info: { DEFAULT: c("berry"), bg: "rgb(var(--berry) / .1)" },
        danger: {
          DEFAULT: c("danger"),
          soft: c("danger"),
          text: c("danger-ink"),
          bg: "rgb(var(--danger) / .1)",
          line: "rgb(var(--danger) / .35)",
          dot: "rgb(var(--danger) / .15)",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "system-ui", "sans-serif"],
        display: ["ui-rounded", '"SF Pro Rounded"', "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      },
      fontWeight: {
        cta: "650",
      },
      transitionTimingFunction: {
        sheet: "cubic-bezier(.32,.72,0,1)",
        arrive: "cubic-bezier(.2,.8,.2,1)",
        spring: "cubic-bezier(.3,.7,.4,1.3)",
      },
      animation: {
        "slide-up": "rise 0.3s cubic-bezier(.2,.8,.2,1) both",
        "sheet-up": "sheet-up 0.36s cubic-bezier(.32,.72,0,1) both",
        "fade-in": "fade-in 0.24s ease-out both",
        "scale-in": "scale-in 0.2s cubic-bezier(.2,.8,.2,1) both",
        rise: "rise 0.42s cubic-bezier(.2,.8,.2,1) both",
        "live-dot": "pulse-ember 1.6s ease-out infinite",
        pop: "pop .38s cubic-bezier(.3,.7,.4,1.5)",
        burst: "burst .5s ease-out forwards",
        pill: "pill-up .34s cubic-bezier(.2,.9,.25,1.2) both",
        blink: "blink 1s step-end infinite",
        tick: "tick .16s cubic-bezier(.2,.8,.2,1)",
        draw: "draw 1.1s cubic-bezier(.4,0,.2,1) both",
        "fade-late": "fade-in .8s .5s both",
        ping: "ping-r 1.6s ease-out 1.1s infinite",
        "word-up": "word-up .7s cubic-bezier(.2,.8,.2,1) both",
        // Ambient motion plays a few times, then settles: no idle battery drain.
        bob: "bob 3.2s ease-in-out 3",
        wave: "wave 4s linear 3",
        "plate-in": "plate-in .4s cubic-bezier(.3,.7,.4,1.3) both",
        fall: "fall 4.5s cubic-bezier(.3,.1,.6,1) both",
        "pop-in": "pop-in .45s cubic-bezier(.3,.7,.4,1.4) both",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "none" },
        },
        "pulse-ember": {
          "0%": { boxShadow: "0 0 0 0 rgba(198,61,34,.6)" },
          "100%": { boxShadow: "0 0 0 7px rgba(198,61,34,0)" },
        },
        pop: {
          "0%": { transform: "scale(.6)" },
          "55%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        burst: {
          "0%": { opacity: ".9", transform: "scale(.4)" },
          "100%": { opacity: "0", transform: "scale(1.9)" },
        },
        "pill-up": {
          from: { opacity: "0", transform: "translateY(24px) scale(.96)" },
          to: { opacity: "1", transform: "none" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        tick: {
          "0%": { transform: "translateY(6px)", opacity: ".3" },
          "100%": { transform: "none", opacity: "1" },
        },
        draw: {
          from: { strokeDashoffset: "var(--len, 900)" },
          to: { strokeDashoffset: "0" },
        },
        "ping-r": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(2.8)", opacity: "0" },
        },
        "word-up": {
          from: { opacity: "0", transform: "translateY(40px)" },
          to: { opacity: "1", transform: "none" },
        },
        bob: {
          "0%,100%": { transform: "translateY(0) rotate(-8deg)" },
          "50%": { transform: "translateY(-6px) rotate(-6deg)" },
        },
        wave: { to: { transform: "translateX(-50%)" } },
        // Ends at the plate's own shade (--o), so no wrapper element is needed for it.
        "plate-in": {
          from: { opacity: "0", transform: "translateX(18px)" },
          to: { opacity: "var(--o, 1)", transform: "none" },
        },
        fall: {
          "0%": { transform: "translate(0,-60px) rotate(0)" },
          "100%": { transform: "translate(var(--dx),900px) rotate(540deg)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.4)" },
          "70%": { opacity: "1", transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
