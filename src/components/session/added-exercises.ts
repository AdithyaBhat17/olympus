import { DEFAULT_REST_SEC } from "@/domain/targets";
import type { ExerciseMeta, LiveItemView } from "@/server/sessions";
import { adhocItemKey } from "@/lib/utils";
import { loggedSets } from "./format";
import type { SwapCandidate } from "./swap-sheet";

/**
 * Exercises added mid-session stay on this phone until their first set is
 * logged, which creates the row server-side (an empty row would read back as
 * a phantom set). Only one session is live at a time, so one key will do.
 */
const STORAGE_KEY = "olympus.added";

export function loadAdded(sessionId: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as {
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
    if (ids.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, ids }));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the added exercise still works until a reload */
  }
}

export function candidateMeta(c: SwapCandidate): ExerciseMeta {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    category: c.category,
    loadMode: c.loadMode as ExerciseMeta["loadMode"],
    carriageKgPerSide: c.carriageKgPerSide,
    isCompound: c.isCompound,
    bodyRegion: c.bodyRegion,
    formCueId: c.formCueId,
    equipment: c.equipment,
  };
}

function addedItem(c: SwapCandidate): LiveItemView {
  return {
    key: adhocItemKey(c.id),
    planItemId: null,
    exercise: candidateMeta(c),
    plannedExercise: null,
    swapped: false,
    restSec: c.isCompound ? DEFAULT_REST_SEC.compound : DEFAULT_REST_SEC.accessory,
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
 * sets on the server yet, in the order they were added.
 */
export function withAddedItems(
  items: LiveItemView[],
  added: string[],
  candidates: Map<string, SwapCandidate>
): LiveItemView[] {
  const keys = new Set(items.map((it) => it.key));
  const extra = added
    .filter((id) => !keys.has(adhocItemKey(id)))
    .flatMap((id) => {
      const c = candidates.get(id);
      return c ? [addedItem(c)] : [];
    });
  return extra.length ? [...items, ...extra] : items;
}

/** Only before its first set: after that it's part of the log (remove the sets instead). */
export function canRemoveAdded(item: LiveItemView): boolean {
  return item.key === adhocItemKey(item.exercise.id) && loggedSets(item).length === 0;
}
