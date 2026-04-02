import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseSetsReps(input: string): { sets: number; reps: number } | null {
  const match = input.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) return null;
  return { sets: parseInt(match[1], 10), reps: parseInt(match[2], 10) };
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
