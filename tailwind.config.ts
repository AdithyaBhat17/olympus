import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Olympus v3 "Chalk & Ember" tokens — from the Olympus Redesign canvas.
 * Display + numerals: Archivo (wdth axis, 72–80%). Body: Geist. Meta: Geist Mono.
 *
 * Colour meaning is strict:
 *   accent (ember) = "your move" — primary CTA, active set, the ✓.
 *   info (ice)     = "from your PT" or "progress / up".
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
        bg: "#0A0A0B",
        "bg-deep": "#000000",
        "bg-nav": "rgba(28,28,31,.72)",
        surface: "#141416",
        "surface-2": "#1C1C1F",
        "surface-3": "#232327",
        "surface-sunk": "#0F0F11",
        sheet: "#161618",
        key: "#26262A",
        "key-down": "#3A3A40",
        line: "#232327",
        "line-soft": "#1C1C1F",
        "line-strong": "#2A2A2E",
        fg: "#F5F3EE",
        "fg-2": "#C9C7C1",
        muted: "#8E8C87",
        faint: "#5E5C58",
        sleep: "#B7A6FF",
        cardio: "#3A3A40",
        accent: {
          DEFAULT: "#FF6A2B",
          hover: "#FF8A55",
          ink: "#1A0A00",
          bg: "rgba(255,106,43,.12)",
          line: "rgba(255,106,43,.35)",
          soft: "#FFB08A",
          ring: "rgba(255,106,43,.35)",
        },
        info: {
          DEFAULT: "#8CC8FF",
          ink: "#0A0A0B",
          bg: "rgba(140,200,255,.1)",
          line: "rgba(140,200,255,.35)",
          text: "#D6E9FF",
        },
        danger: {
          DEFAULT: "#FF7A6B",
          soft: "#FF9A8E",
          text: "#FFB3A8",
          bg: "rgba(255,122,107,.1)",
          line: "rgba(255,122,107,.35)",
          dot: "#3A1E1A",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        display: ["var(--font-archivo)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
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
          "0%": { boxShadow: "0 0 0 0 rgba(255,106,43,.6)" },
          "100%": { boxShadow: "0 0 0 7px rgba(255,106,43,0)" },
        },
        "pulse-ice": {
          "0%": { boxShadow: "0 0 0 0 rgba(140,200,255,.55)" },
          "100%": { boxShadow: "0 0 0 7px rgba(140,200,255,0)" },
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
