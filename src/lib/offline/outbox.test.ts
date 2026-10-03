import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ kind: string; args: unknown[] }> = [];
let mode: "ok" | "offline" | "reject" = "ok";

function fake(kind: string) {
  return vi.fn(async (...args: unknown[]) => {
    if (mode === "offline") throw new TypeError("Failed to fetch");
    calls.push({ kind, args });
    return mode === "reject" ? { ok: false, error: "Session is already finished" } : { ok: true, data: { kind } };
  });
}

vi.mock("@/lib/liftlog-actions", () => ({
  logSetAction: fake("logSet"),
  removeSetAction: fake("removeSet"),
  resolveFlagAction: fake("resolveFlag"),
  saveSessionNotesAction: fake("saveNotes"),
  upsertCheckInAction: fake("checkIn"),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const SID = "00000000-0000-4000-8000-000000000001";
const EX = "00000000-0000-4000-8000-000000000002";
const set = (setIndex: number, reps: number) =>
  ({ kind: "logSet", sessionId: SID, input: { exerciseId: EX, setIndex, reps, weight: 50 } }) as const;

describe("outbox", () => {
  beforeEach(async () => {
    vi.resetModules();
    calls.length = 0;
    mode = "ok";
  });

  it("sends straight through when online", async () => {
    const { send } = await import("./outbox");
    const res = await send(set(0, 10));
    expect(res).toEqual({ status: "ok", data: { kind: "logSet" } });
    expect(calls).toHaveLength(1);
  });

  it("returns rejected on a domain error so the caller rolls back", async () => {
    const { send } = await import("./outbox");
    mode = "reject";
    expect(await send(set(0, 10))).toEqual({ status: "rejected", error: "Session is already finished" });
  });

  it("queues on network failure, coalesces by set, and replays in order", async () => {
    const { send, flush, pendingCount } = await import("./outbox");
    mode = "offline";
    expect(await send(set(0, 10))).toEqual({ status: "queued" });
    await send(set(1, 9));
    await send(set(0, 11)); // supersedes the first
    await send({ kind: "checkIn", input: { waterMl: 2000 } });
    await send({ kind: "checkIn", input: { sleepMin: 420 } }); // merged, not dropped
    expect(pendingCount()).toBe(3);

    mode = "ok";
    expect(await flush()).toBe(3);
    expect(pendingCount()).toBe(0);
    expect(calls.map((c) => c.kind)).toEqual(["logSet", "logSet", "checkIn"]);
    expect((calls[1].args[1] as { reps: number }).reps).toBe(11);
    expect(calls[2].args[0]).toEqual({ waterMl: 2000, sleepMin: 420 });
  });

  it("doesn't let a new op jump ahead of queued ones", async () => {
    const { send, flush } = await import("./outbox");
    mode = "offline";
    await send(set(0, 10));
    mode = "ok";
    expect(await send(set(1, 8))).toEqual({ status: "queued" });
    await flush();
    expect(calls.map((c) => (c.args[1] as { setIndex: number }).setIndex)).toEqual([0, 1]);
  });
});
