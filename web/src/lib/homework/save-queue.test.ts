import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveQueue, type SaveStatus } from "./save-queue";

/** A save the test resolves or rejects by hand, to hold one "in flight". */
function deferredSave() {
  const calls: { key: string; value: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  const save = vi.fn(
    (key: string, value: string) =>
      new Promise<void>((resolve, reject) => calls.push({ key, value, resolve, reject })),
  );
  return { save, calls };
}

describe("createSaveQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces: only the last value within the delay is sent", async () => {
    const save = vi.fn(async () => {});
    const q = createSaveQueue<string>({ save, delayMs: 600 });
    q.schedule("q1", "a");
    q.schedule("q1", "ab");
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("q1", "ab");
  });

  it("flush sends an answer still waiting on its timer, before resolving", async () => {
    const order: string[] = [];
    const save = vi.fn(async (_k: string, v: string) => { order.push(`save ${v}`); });
    const q = createSaveQueue<string>({ save, delayMs: 600 });
    q.schedule("q1", "final answer");
    await q.flush();
    order.push("submit");
    expect(order).toEqual(["save final answer", "submit"]);
    // and the cleared timer does not send it a second time
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledOnce();
  });

  it("flush waits for a save already in flight", async () => {
    const { save, calls } = deferredSave();
    const q = createSaveQueue<string>({ save, delayMs: 600 });
    q.schedule("q1", "x");
    await vi.advanceTimersByTimeAsync(600);
    let done = false;
    const flushed = q.flush().then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    calls[0].resolve();
    await flushed;
    expect(done).toBe(true);
  });

  it("an old save landing late does not clear a newer answer", async () => {
    const { save, calls } = deferredSave();
    const q = createSaveQueue<string>({ save, delayMs: 600 });
    q.schedule("q1", "old");
    await vi.advanceTimersByTimeAsync(600);
    q.schedule("q1", "new");
    calls[0].resolve();
    const flushed = q.flush();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].value).toBe("new");
    calls[1].resolve();
    await flushed;
  });

  it("flush retries a failed save and rejects if it fails again", async () => {
    const save = vi.fn(async () => { throw new Error("too long"); });
    const statuses: SaveStatus[] = [];
    const q = createSaveQueue<string>({ save, delayMs: 600, onStatus: (s) => statuses.push(s) });
    q.schedule("q1", "x");
    await vi.advanceTimersByTimeAsync(600);
    expect(statuses.at(-1)?.error).toBe("too long");
    await expect(q.flush()).rejects.toThrow("too long");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("a failure clears once that answer saves", async () => {
    let fail = true;
    const save = vi.fn(async () => { if (fail) throw new Error("offline"); });
    const statuses: SaveStatus[] = [];
    const q = createSaveQueue<string>({ save, delayMs: 600, onStatus: (s) => statuses.push(s) });
    q.schedule("q1", "x");
    await vi.advanceTimersByTimeAsync(600);
    expect(statuses.at(-1)?.error).toBe("offline");
    fail = false;
    await q.flush();
    expect(statuses.at(-1)).toEqual({ inFlight: 0, queued: 0, error: null });
  });

  it("reports in-flight saves so the form can hold Submit", async () => {
    const { save, calls } = deferredSave();
    const statuses: SaveStatus[] = [];
    const q = createSaveQueue<string>({ save, delayMs: 600, onStatus: (s) => statuses.push(s) });
    q.schedule("q1", "x");
    expect(statuses.at(-1)).toMatchObject({ inFlight: 0, queued: 1 });
    await vi.advanceTimersByTimeAsync(600);
    expect(statuses.at(-1)).toMatchObject({ inFlight: 1, queued: 0 });
    calls[0].resolve();
    await vi.waitFor(() => expect(statuses.at(-1)).toMatchObject({ inFlight: 0 }));
  });

  it("cancel stops pending timers", async () => {
    const save = vi.fn(async () => {});
    const q = createSaveQueue<string>({ save, delayMs: 600 });
    q.schedule("q1", "x");
    q.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });
});
