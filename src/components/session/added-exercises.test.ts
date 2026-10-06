import { describe, expect, it } from "vitest";
import type { ExerciseMeta, LiveItemView } from "@/server/sessions";
import { adhocItemKey } from "@/lib/utils";
import type { SwapCandidate } from "./swap-sheet";
import { canRemoveAdded, withAddedItems } from "./added-exercises";

const meta = (id: string, isCompound = false): ExerciseMeta => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  category: "chest",
  loadMode: "TOTAL",
  carriageKgPerSide: null,
  isCompound,
  bodyRegion: "upper",
  formCueId: null,
  equipment: null,
});

const candidate = (id: string, isCompound = false): SwapCandidate => ({
  exerciseId: id,
  exerciseUuid: id,
  id,
  slug: id,
  name: id.toUpperCase(),
  category: "chest",
  status: "YES",
  loadMode: "TOTAL",
  carriageKgPerSide: null,
  blocked: false,
  blockedReason: null,
  substitutes: [],
  lastKg: 40,
  isCompound,
  bodyRegion: "upper",
  formCueId: null,
  equipment: null,
  coachFlags: [],
});

const item = (key: string, exerciseId: string, planItemId: string | null): LiveItemView => ({
  key,
  planItemId,
  exercise: meta(exerciseId),
  plannedExercise: null,
  swapped: false,
  restSec: 90,
  straps: false,
  cues: [],
  pairGroup: null,
  sets: [{ index: 0, planned: null, logged: { reps: 8, weight: 40 }, last: null }],
  notes: null,
  lastTopKg: null,
  done: true,
  coachFlags: [],
  blockedReason: null,
});

const candidates = new Map([candidate("press", true), candidate("fly")].map((c) => [c.id, c]));

describe("withAddedItems", () => {
  it("appends an added exercise with no server row as an empty unplanned item", () => {
    const planned = item("p1", "squat", "p1");
    const out = withAddedItems([planned], ["press"], candidates);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(planned);
    expect(out[1]).toMatchObject({
      key: adhocItemKey("press"),
      planItemId: null,
      exercise: meta("press", true),
      restSec: 180,
      lastTopKg: 40,
      done: false,
      sets: [{ index: 0, planned: null, logged: null, last: null }],
    });
  });

  it("defers to the server item once the first set has created the row", () => {
    const logged = item(adhocItemKey("fly"), "fly", null);
    const items = [item("p1", "squat", "p1"), logged];
    expect(withAddedItems(items, ["fly"], candidates)).toBe(items);
  });

  it("still adds an exercise that is also planned", () => {
    const out = withAddedItems([item("p1", "fly", "p1")], ["fly"], candidates);
    expect(out.map((i) => i.key)).toEqual(["p1", adhocItemKey("fly")]);
  });

  it("skips ids missing from the library", () => {
    expect(withAddedItems([], ["gone"], candidates)).toEqual([]);
  });
});

describe("canRemoveAdded", () => {
  it("allows removing an added exercise only before its first set", () => {
    const [empty] = withAddedItems([], ["fly"], candidates);
    expect(canRemoveAdded(empty, ["fly"])).toBe(true);
    expect(canRemoveAdded(item(adhocItemKey("fly"), "fly", null), ["fly"])).toBe(false);
    expect(canRemoveAdded({ ...item("p1", "fly", "p1"), sets: empty.sets }, ["fly"])).toBe(false);
  });

  it("never offers removal for an unplanned row this phone didn't add", () => {
    const row = { ...item(adhocItemKey("fly"), "fly", null), sets: [{ index: 0, planned: null, logged: null, last: null }] };
    expect(canRemoveAdded(row, [])).toBe(false);
  });
});
