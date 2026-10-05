import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Olympus "Coral" tokens — light, colour-blocked, Apple-native type.
 * System fonts only (SF Pro on Apple devices, SF Pro Rounded for numerals).
 *
 * Colour meaning is strict:
 *   accent (coral) = "your move" — primary CTA, active set, the check.
 *   info (berry)   = "from your PT" or "progress / up".
 *   k-*            = the current session type's colour block (.kind-a/b/c/cardio).
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#FBF6F4",
        "bg-deep": "#F6EEEA",
        "bg-nav": "rgba(30,20,18,.72)",
        surface: "#F3E8E4",
        "surface-2": "#EEE2DD",
        "surface-3": "#E9D9D3",
        "surface-sunk": "#F0E6E2",
        sheet: "#FBF6F4",
        key: "#E9D9D3",
        "key-down": "#DCC8C0",
        line: "#E9D9D3",
        "line-soft": "#EEE2DD",
        "line-strong": "#DCC8C0",
        fg: "#1E1412",
        "fg-2": "#3F302C",
        muted: "#74625D",
        faint: "#9C8A84",
        sleep: "#5B4BC4",
        apricot: { DEFAULT: "#F2A65A", ink: "#3D1F05" },
        berry: "#8E3B5E",
        // Session-type colour block, set by .kind-* on an ancestor (see globals.css).
        k: {
          DEFAULT: "rgb(var(--k) / <alpha-value>)",
          on: "rgb(var(--k-on) / <alpha-value>)",
          text: "rgb(var(--k-text) / <alpha-value>)",
          1: "rgb(var(--k1) / <alpha-value>)",
          2: "rgb(var(--k2) / <alpha-value>)",
          3: "rgb(var(--k3) / <alpha-value>)",
        },
        cardio: "#DCC8C0",
        accent: {
          DEFAULT: "#C63D22",
          hover: "#B0341C",
          ink: "#FFFFFF",
          bg: "rgba(198,61,34,.12)",
          line: "rgba(198,61,34,.35)",
          soft: "#8F2914",
          ring: "rgba(198,61,34,.35)",
        },
        info: {
          DEFAULT: "#8E3B5E",
          ink: "#FBF6F4",
          bg: "rgba(142,59,94,.1)",
          line: "rgba(142,59,94,.35)",
          text: "#6E2A47",
        },
        danger: {
          DEFAULT: "#B3261E",
          soft: "#C9473F",
          text: "#8C1D18",
          bg: "rgba(179,38,30,.1)",
          line: "rgba(179,38,30,.35)",
          dot: "#F4D9D6",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "system-ui", "sans-serif"],
        display: ["ui-rounded", '"SF Pro Rounded"', "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        // No monospace anywhere: "mono" is the same system face with tabular figures.
        mono: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "system-ui", "sans-serif"],
      },
      fontWeight: {
        cta: "650",
      },
      borderRadius: {
        "4xl": "32px",
        hero: "28px",
        card: "24px",
        row: "14px",
        cta: "18px",
      },
      height: {
        cta: "58px",
      },
      transitionTimingFunction: {
        press: "cubic-bezier(.3,.7,.4,1.5)",
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
        "live-dot-ice": "pulse-ice 1.6s ease-out infinite",
        sheen: "sheen 3.2s cubic-bezier(.4,0,.2,1) infinite",
        nudge: "nudge .6s ease-in-out infinite",
        pop: "pop .38s cubic-bezier(.3,.7,.4,1.5)",
        burst: "burst .5s ease-out forwards",
        pill: "pill-up .34s cubic-bezier(.2,.9,.25,1.2) both",
        blink: "blink 1s step-end infinite",
        tick: "tick .16s cubic-bezier(.2,.8,.2,1)",
        stamp: "stamp .55s cubic-bezier(.3,.7,.4,1.3) .15s both",
        spark: "spark 1.1s cubic-bezier(.2,.8,.2,1) .2s both",
        "day-pop": "day-pop .3s cubic-bezier(.3,.7,.4,1.4) both",
        draw: "draw 1.1s cubic-bezier(.4,0,.2,1) both",
        "fade-late": "fade-in .8s .5s both",
        ping: "ping-r 1.6s ease-out 1.1s infinite",
        "word-up": "word-up .7s cubic-bezier(.2,.8,.2,1) both",
        bar: "bar .9s cubic-bezier(.7,0,.2,1) .25s both",
        bob: "bob 3.2s ease-in-out infinite",
        wave: "wave 4s linear infinite",
        breathe: "breathe 1.8s ease-in-out infinite",
        "plate-in": "plate-in .4s cubic-bezier(.3,.7,.4,1.3) both",
        fall: "fall linear infinite",
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
        "pulse-ice": {
          "0%": { boxShadow: "0 0 0 0 rgba(142,59,94,.55)" },
          "100%": { boxShadow: "0 0 0 7px rgba(142,59,94,0)" },
        },
        sheen: {
          "0%": { transform: "translateX(-120%)" },
          "60%, 100%": { transform: "translateX(260%)" },
        },
        nudge: {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(4px)" },
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
        stamp: {
          "0%": { transform: "scale(1.6) rotate(-8deg)", opacity: "0" },
          "60%": { transform: "scale(.94) rotate(0)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        spark: {
          "0%": { opacity: "0", transform: "translate(0,0) scale(.4)" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translate(var(--dx),var(--dy)) scale(1)" },
        },
        "day-pop": {
          from: { opacity: "0", transform: "scale(.5)" },
          to: { opacity: "1", transform: "none" },
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
        bar: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        bob: {
          "0%,100%": { transform: "translateY(0) rotate(-8deg)" },
          "50%": { transform: "translateY(-6px) rotate(-6deg)" },
        },
        wave: { to: { transform: "translateX(-50%)" } },
        breathe: {
          "0%,100%": { boxShadow: "inset 0 0 0 3px rgb(var(--k)), 0 0 0 0 rgb(var(--k) / .45)" },
          "50%": { boxShadow: "inset 0 0 0 3px rgb(var(--k)), 0 0 0 7px rgb(var(--k) / 0)" },
        },
        "plate-in": {
          from: { opacity: "0", transform: "translateX(18px)" },
          to: { opacity: "1", transform: "none" },
        },
        fall: {
          "0%": { transform: "translate(0,-60px) rotate(0)" },
          "100%": { transform: "translate(var(--dx),110vh) rotate(540deg)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.4)" },
          "70%": { opacity: "1", transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".stretch-62": { "font-stretch": "62%" },
        ".stretch-72": { "font-stretch": "72%" },
        ".stretch-80": { "font-stretch": "80%" },
        ".stretch-100": { "font-stretch": "100%" },
      });
    }),
  ],
};
export default config;
