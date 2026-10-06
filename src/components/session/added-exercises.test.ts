import { describe, expect, it } from "vitest";
import type { ExerciseMeta, LiveItemView } from "@/server/sessions";
import type { SwapCandidate } from "./swap-sheet";
import { addedKey, withAddedItems } from "./added-exercises";

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
  meta: meta(id, isCompound),
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
      key: addedKey("press"),
      planItemId: null,
      restSec: 180,
      lastTopKg: 40,
      done: false,
      sets: [{ index: 0, planned: null, logged: null, last: null }],
    });
  });

  it("keeps the added key once the first set has created the server row", () => {
    const out = withAddedItems([item("p1", "squat", "p1"), item("x-row1", "fly", null)], ["fly"], candidates);
    expect(out.map((i) => i.key)).toEqual(["p1", addedKey("fly")]);
    expect(out[1].sets[0].logged).toEqual({ reps: 8, weight: 40 });
  });

  it("never claims a planned item of the same exercise", () => {
    const out = withAddedItems([item("p1", "fly", "p1")], ["fly"], candidates);
    expect(out.map((i) => i.key)).toEqual(["p1", addedKey("fly")]);
  });

  it("leaves unplanned rows that weren't added on this phone alone", () => {
    const out = withAddedItems([item("x-row1", "fly", null)], [], candidates);
    expect(out.map((i) => i.key)).toEqual(["x-row1"]);
  });

  it("skips ids missing from the library", () => {
    expect(withAddedItems([], ["gone"], candidates)).toEqual([]);
  });
});
