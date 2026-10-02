import type { Config } from "tailwindcss";

/**
 * LiftLog v2 tokens — from the "Lift App Redesign" canvas.
 * Display numbers: Barlow Condensed. Body: IBM Plex Sans. Exports: IBM Plex Mono.
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
        bg: "#0E0F11",
        "bg-deep": "#070708",
        "bg-nav": "#121315",
        surface: "#17191C",
        "surface-2": "#202327",
        "surface-sunk": "#141518",
        line: "#2C3036",
        "line-soft": "#22252A",
        "line-strong": "#3A3F47",
        fg: "#F2F0EA",
        "fg-2": "#D8D6D0",
        muted: "#A3A7AE",
        faint: "#6E737B",
        accent: {
          DEFAULT: "#FFB547",
          hover: "#FFD08A",
          ink: "#1A1300",
          bg: "#2A2414",
          line: "#5A4720",
          soft: "#E8C88A",
          ring: "#3A3220",
        },
        info: {
          DEFAULT: "#7FB2FF",
          ink: "#0E1A2E",
          bg: "#2A2F38",
          line: "#3A4A66",
        },
        danger: {
          DEFAULT: "#FF7A6B",
          soft: "#FF9A8E",
          text: "#FFB3A8",
          bg: "#221715",
          line: "#5C2E28",
          dot: "#3A1E1A",
        },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-barlow)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "4xl": "22px",
      },
      animation: {
        "slide-up": "slide-up 0.25s ease-out",
        "sheet-up": "sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
        "fade-in": "fade-in 0.15s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
      },
      keyframes: {
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
