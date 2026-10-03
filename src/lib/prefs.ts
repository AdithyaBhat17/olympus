"use client";

import { useSyncExternalStore } from "react";

/** Per-device gym-floor preferences (Settings ▸ On the gym floor). */
export interface Prefs {
  haptics: boolean;
  wakeLock: boolean;
}

const KEY = "olympus.prefs";
const DEFAULTS: Prefs = { haptics: true, wakeLock: true };
const listeners = new Set<() => void>();
let cache: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cache) return cache;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    cache = { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Prefs>) : {}) };
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  cache = { ...getPrefs(), [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable — keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULTS);
}
