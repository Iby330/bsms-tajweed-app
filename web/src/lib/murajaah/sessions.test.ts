import { describe, expect, it } from "vitest";
import { sessionOutcome, toSessionView, type SessionRowLike } from "./sessions";

const ROW: SessionRowLike = {
  id: "s1", class_id: "c1", listener_id: "L", reciter_id: "R",
  portion_kind: "juz", portion_ns: [28, 30], portion_label: "Juz 28 + 30",
  hizb_eq: "4.00" as unknown as number, mistake_limit: 10,
  band_minutes: { ideal: 10, good: 15, acceptable: 20 },
  created_at: "2026-11-10T18:00:00Z", timer_started_at: "2026-11-10T18:01:00Z",
  running_since: null, elapsed_ms: 41 * 60_000, finished_at: "2026-11-10T18:45:00Z",
  submitted_at: "2026-11-10T18:46:00Z", note: "Strong",
};

describe("toSessionView", () => {
  it("maps a row with its marks, checkpoints and names", () => {
    const v = toSessionView(
      ROW,
      [
        { id: "m2", session_id: "s1", at_ms: 2000, surah_number: 58, ayah_number: 3, word_position: 4, category: "tajweed" },
        { id: "m1", session_id: "s1", at_ms: 1000, surah_number: null, ayah_number: null, word_position: null, category: null },
      ],
      [{ id: "c1", session_id: "s1", kind: "auto", ord: 1, label: "End of Hizb 55", at_ms: 9 * 60_000 }],
      new Map([["L", "Moadh Hwessa"], ["R", "Yunus Zafar"]]),
    );
    expect(v).toMatchObject({
      id: "s1", classId: "c1", listenerName: "Moadh Hwessa", reciterName: "Yunus Zafar",
      kind: "juz", ns: [28, 30], label: "Juz 28 + 30", hizbEq: 4, mistakeLimit: 10,
      minutes: { ideal: 10, good: 15, acceptable: 20 },
      submittedAt: "2026-11-10T18:46:00Z", note: "Strong", mistakes: 2,
      clock: { elapsed_ms: 41 * 60_000, running_since: null, finished_at: "2026-11-10T18:45:00Z" },
    });
    // Marks in time order.
    expect(v.marks.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(v.marks[1]).toEqual({ id: "m2", atMs: 2000, surah: 58, ayah: 3, position: 4, category: "tajweed" });
    expect(v.checkpoints[0]).toEqual({ id: "c1", kind: "auto", ord: 1, label: "End of Hizb 55", atMs: 9 * 60_000 });
  });

  it("falls back to 'Classmate' for an unknown name and to the defaults for odd minutes", () => {
    const v = toSessionView({ ...ROW, band_minutes: null as never }, [], [], new Map());
    expect(v.listenerName).toBe("Classmate");
    expect(v.minutes).toEqual({ ideal: 10, good: 15, acceptable: 20 });
  });
});

describe("sessionOutcome", () => {
  it("bands the total on the snapshot and checks the snapshot limit, inclusive", () => {
    const v = toSessionView(ROW, [], [], new Map());
    expect(sessionOutcome(v)).toEqual({ totalMs: 41 * 60_000, band: "good", mistakes: 0, limit: 10, withinLimit: true });
    const at = (n: number) => ({ id: `m${n}`, session_id: "s1", at_ms: n, surah_number: null, ayah_number: null, word_position: null, category: null });
    const ten = toSessionView(ROW, Array.from({ length: 10 }, (_, i) => at(i)), [], new Map());
    expect(sessionOutcome(ten).withinLimit).toBe(true);
    const eleven = toSessionView(ROW, Array.from({ length: 11 }, (_, i) => at(i)), [], new Map());
    expect(sessionOutcome(eleven).withinLimit).toBe(false);
  });
});
