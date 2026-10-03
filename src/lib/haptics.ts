"use client";

import { getPrefs } from "./prefs";

/**
 * Haptics. Android: navigator.vibrate. iOS has no vibrate API, but toggling a
 * native `<input type="checkbox" switch>` (iOS 18+ Safari) plays the system
 * tick — so we keep a hidden one around and click its label.
 * Not gated by prefers-reduced-motion: haptics are feedback, not motion.
 */

let iosSwitch: HTMLLabelElement | null = null;

function iosTick() {
  if (typeof document === "undefined") return;
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-100px;top:0";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

function buzz(pattern: number | number[]) {
  if (!getPrefs().haptics) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
      return;
    }
    iosTick();
  } catch {
    /* unsupported */
  }
}

/** Light tick: set logged, RPE picked, flag done. */
export const hapticTick = () => buzz(8);

/** Rest finished. iOS only gets a single tick (one per user gesture-free call). */
export const hapticRestEnd = () => buzz([30, 40, 30]);
