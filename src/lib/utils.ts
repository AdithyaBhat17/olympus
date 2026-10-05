import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Today in the device's own timezone (en-CA formats as YYYY-MM-DD). */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** "Lower Body — Quad Dominant" as display copy: "Lower Body, Quad Dominant". */
export function formatCategory(category: string): string {
  return category.replace(/ — /g, ", ");
}

const KINDS = ["kind-a", "kind-b", "kind-c"] as const;

/**
 * Colour block for a session type: A coral, B berry, C apricot, then round
 * again (D coral, E berry…). Anything that isn't a rotation letter (cardio,
 * other) is ink.
 */
export function kindClass(sessionType: string | null | undefined): string {
  if (!sessionType || !/^[A-Z]$/.test(sessionType)) return "kind-cardio";
  return KINDS[(sessionType.charCodeAt(0) - 65) % KINDS.length];
}
