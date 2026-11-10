import { describe, expect, it } from "vitest";
import { applyClockOp, clockPhase, clockSkew, elapsedAt, NEW_CLOCK, type ClockFields } from "./clock";

const T0 = Date.parse("2026-11-10T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("elapsedAt", () => {
  it("is the stored total while not running", () => {
    const c: ClockFields = { ...NEW_CLOCK, elapsed_ms: 60_000, timer_started_at: iso(T0) };
    expect(elapsedAt(c, T0 + 999_999)).toBe(60_000);
  });

  it("adds the running span while running", () => {
    const c: ClockFields = { ...NEW_CLOCK, elapsed_ms: 60_000, timer_started_at: iso(T0), running_since: iso(T0 + 100_000) };
    expect(elapsedAt(c, T0 + 130_000)).toBe(90_000);
    expect(elapsedAt(c, new Date(T0 + 130_000))).toBe(90_000);
  });

  it("corrects for the client's clock running behind the server's", () => {
    const c: ClockFields = { ...NEW_CLOCK, timer_started_at: iso(T0), running_since: iso(T0) };
    // The client reads 10 s behind the server.
    expect(elapsedAt(c, T0 + 20_000 - 10_000, 10_000)).toBe(20_000);
  });

  it("never goes negative when the client is ahead of running_since", () => {
    const c: ClockFields = { ...NEW_CLOCK, timer_started_at: iso(T0), running_since: iso(T0) };
    expect(elapsedAt(c, T0 - 5_000)).toBe(0);
  });
});

describe("clockSkew", () => {
  it("is server time minus client time", () => {
    expect(clockSkew(iso(T0 + 10_000), T0)).toBe(10_000);
    expect(clockSkew(iso(T0), T0 + 2_000)).toBe(-2_000);
  });
});

describe("applyClockOp, mirroring murajaah_clock()", () => {
  it("runs start → pause → resume → pause → finish and keeps only running time", () => {
    let c = applyClockOp(NEW_CLOCK, "start", T0);
    expect(clockPhase(c)).toBe("running");
    expect(c.timer_started_at).toBe(iso(T0));

    c = applyClockOp(c, "pause", T0 + 120_000); // ran 2:00
    expect(clockPhase(c)).toBe("paused");
    expect(c.elapsed_ms).toBe(120_000);
    expect(elapsedAt(c, T0 + 500_000)).toBe(120_000); // a long pause adds nothing

    c = applyClockOp(c, "resume", T0 + 300_000);
    expect(elapsedAt(c, T0 + 330_000)).toBe(150_000);

    c = applyClockOp(c, "pause", T0 + 360_000); // ran another 1:00
    expect(c.elapsed_ms).toBe(180_000);

    c = applyClockOp(c, "resume", T0 + 400_000);
    c = applyClockOp(c, "finish", T0 + 430_000); // and 0:30 more
    expect(clockPhase(c)).toBe("finished");
    expect(c.elapsed_ms).toBe(210_000);
    expect(c.running_since).toBeNull();
    expect(c.finished_at).toBe(iso(T0 + 430_000));
    expect(c.timer_started_at).toBe(iso(T0)); // the first Start is kept
  });

  it("can finish from a pause without adding time", () => {
    let c = applyClockOp(NEW_CLOCK, "start", T0);
    c = applyClockOp(c, "pause", T0 + 60_000);
    c = applyClockOp(c, "finish", T0 + 999_000);
    expect(c.elapsed_ms).toBe(60_000);
  });

  it("treats a repeated op as a no-op", () => {
    let c = applyClockOp(NEW_CLOCK, "start", T0);
    const again = applyClockOp(c, "start", T0 + 5_000);
    expect(again).toEqual(c);
    c = applyClockOp(c, "pause", T0 + 10_000);
    expect(applyClockOp(c, "pause", T0 + 20_000)).toEqual(c);
  });

  it("refuses to resume or finish before the first Start, and anything after Finish", () => {
    expect(() => applyClockOp(NEW_CLOCK, "resume", T0)).toThrow(/not started/);
    expect(() => applyClockOp(NEW_CLOCK, "finish", T0)).toThrow(/not started/);
    const done = applyClockOp(applyClockOp(NEW_CLOCK, "start", T0), "finish", T0 + 1_000);
    expect(() => applyClockOp(done, "start", T0 + 2_000)).toThrow(/finished/);
  });
});

describe("clockPhase", () => {
  it("is idle before the first Start", () => {
    expect(clockPhase(NEW_CLOCK)).toBe("idle");
  });
});
