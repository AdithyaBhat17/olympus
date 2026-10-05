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

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Colour block for a session type: A coral, B berry, C apricot, anything else ink. */
export function kindClass(sessionType: string | null | undefined): string {
  switch (sessionType) {
    case "A":
      return "kind-a";
    case "B":
      return "kind-b";
    case "C":
      return "kind-c";
    default:
      return "kind-cardio";
  }
}
