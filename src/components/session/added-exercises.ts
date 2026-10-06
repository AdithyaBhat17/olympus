import type { LiveItemView } from "@/server/sessions";
import type { SwapCandidate } from "./swap-sheet";

/**
 * Exercises added mid-session stay on this phone until their first set is
 * logged, which creates the row server-side (an empty row would read back as
 * a phantom set). Only one session is live at a time, so one key will do.
 */
const ADDED_STORAGE_KEY = "olympus:added-exercises";

export function loadAdded(sessionId: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(ADDED_STORAGE_KEY) ?? "null") as {
      sessionId?: unknown;
      ids?: unknown;
    } | null;
    if (v?.sessionId !== sessionId || !Array.isArray(v.ids)) return [];
    return v.ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function saveAdded(sessionId: string, ids: string[]) {
  try {
    if (ids.length) window.localStorage.setItem(ADDED_STORAGE_KEY, JSON.stringify({ sessionId, ids }));
    else window.localStorage.removeItem(ADDED_STORAGE_KEY);
  } catch {
    /* storage unavailable: the added exercise still works until a reload */
  }
}

export const addedKey = (exerciseId: string) => `add-${exerciseId}`;

function addedItem(c: SwapCandidate): LiveItemView {
  return {
    key: addedKey(c.id),
    planItemId: null,
    exercise: c.meta,
    plannedExercise: null,
    swapped: false,
    restSec: c.meta.isCompound ? 180 : 90,
    straps: false,
    cues: [],
    pairGroup: null,
    sets: [{ index: 0, planned: null, logged: null, last: null }],
    notes: null,
    lastTopKg: c.lastKg,
    done: false,
    coachFlags: [],
    blockedReason: c.blockedReason,
  };
}

/**
 * The server's items plus the exercises added on this phone that have no
 * sets on the server yet, appended in the order they were added.
 */
export function withAddedItems(
  items: LiveItemView[],
  added: string[],
  candidates: Map<string, SwapCandidate>
): LiveItemView[] {
  const onServer = new Set<string>();
  const list = items.map((it) => {
    // Once its first set lands, an added exercise keeps the key it had, so
    // the optimistic sets and the selection carry over.
    if (it.planItemId || !added.includes(it.exercise.id) || onServer.has(it.exercise.id)) return it;
    onServer.add(it.exercise.id);
    return { ...it, key: addedKey(it.exercise.id) };
  });
  for (const id of added) {
    const c = candidates.get(id);
    if (c && !onServer.has(id)) list.push(addedItem(c));
  }
  return list;
}
