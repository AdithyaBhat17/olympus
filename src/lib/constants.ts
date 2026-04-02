export const EXERCISE_CATEGORIES = [
  "Lower Body — Quad Dominant",
  "Lower Body — Posterior Chain",
  "Upper Body — Push (Horizontal)",
  "Upper Body — Push (Vertical)",
  "Upper Body — Pull (Horizontal)",
  "Upper Body — Pull (Vertical)",
  "Arms",
  "Core",
  "Calves",
] as const;

export const STATUS_CONFIG = {
  YES: {
    label: "Active",
    badgeClass: "bg-emerald-500/20 text-emerald-400",
    dotClass: "bg-emerald-500",
  },
  SUB: {
    label: "Sub",
    badgeClass: "bg-amber-500/20 text-amber-400",
    dotClass: "bg-amber-500",
  },
  NO: {
    label: "No",
    badgeClass: "bg-stone-700/50 text-stone-500",
    dotClass: "bg-stone-600",
  },
} as const;
