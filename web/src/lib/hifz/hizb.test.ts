import { describe, it, expect } from "vitest";
import {
  hizbOf,
  juzOf,
  assumedPassed,
  hizbBlocks,
  checkStatus,
  juzProgress,
  rowPlan,
  HIZB_BOUNDS,
  JUZ_BOUNDS,
} from "./hizb";
import type { Surah } from "./pace";

/** The real run: order_index 1..43 = surah 114 down to 72. */
export const RUN: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${114 - i}`,
  name_en: `S${114 - i}`,
}));

const passedFirstN = (n: number) => new Set(RUN.slice(0, n).map((s) => s.number));

describe("hizbOf — standard mushaf bounds", () => {
  it("hizb 60 runs Al-A'la (87) to An-Nas (114)", () => {
    expect(hizbOf(114)).toBe(60);
    expect(hizbOf(87)).toBe(60);
    expect(hizbOf(86)).toBe(59); // At-Tariq is hizb 59, NOT 60
  });
  it("hizb 59 runs An-Naba (78) to At-Tariq (86)", () => {
    expect(hizbOf(78)).toBe(59);
    expect(hizbOf(77)).toBe(58); // Al-Mursalat starts hizb 58's range
  });
  it("hizb 58 runs Al-Jinn (72) to Al-Mursalat (77) — the run ends on its boundary", () => {
    expect(hizbOf(72)).toBe(58);
    expect(hizbOf(71)).toBe(57); // Nuh — outside the programme
  });
  it("returns null outside the mapped ranges", () => {
    expect(hizbOf(66)).toBeNull();
  });
});

describe("juzOf", () => {
  it("Juz 'Amma is 78–114, Tabarak is 67–77", () => {
    expect(juzOf(114)).toBe(30);
    expect(juzOf(78)).toBe(30);
    expect(juzOf(77)).toBe(29);
    expect(juzOf(67)).toBe(29);
    expect(juzOf(66)).toBeNull();
  });
});

describe("assumedPassed", () => {
  it("a fresh student's set is just their records", () => {
    const passed = new Set([114, 113]);
    expect(assumedPassed(RUN, RUN, passed)).toEqual(new Set([114, 113]));
    expect(passed).toEqual(new Set([114, 113])); // input untouched
  });
  it("a returning student's pre-start surahs count as passed", () => {
    const list = RUN.slice(10); // starts at surah 104
    const out = assumedPassed(RUN, list, new Set([104]));
    expect(out.has(114)).toBe(true);  // done last year
    expect(out.has(105)).toBe(true);
    expect(out.has(104)).toBe(true);  // this year's record
    expect(out.has(103)).toBe(false); // not yet passed
    expect(out.size).toBe(11);
  });
  it("an empty list adds nothing", () => {
    expect(assumedPassed(RUN, [], new Set([114]))).toEqual(new Set([114]));
  });
});

describe("hizbBlocks", () => {
  it("splits the run into 60 (28), 59 (9), 58 (6)", () => {
    const blocks = hizbBlocks(RUN, new Set());
    expect(blocks.map((b) => b.hizb)).toEqual([60, 59, 58]);
    expect(blocks.map((b) => b.surahs.length)).toEqual([28, 9, 6]);
    expect(blocks[0].state).toBe("current");
    expect(blocks[1].state).toBe("upcoming");
  });
  it("marks a fully passed block complete and moves current on", () => {
    const blocks = hizbBlocks(RUN, passedFirstN(28)); // all of hizb 60
    expect(blocks[0].state).toBe("complete");
    expect(blocks[1].state).toBe("current");
    expect(blocks[1].passedCount).toBe(0);
  });
  it("counts partial progress", () => {
    const blocks = hizbBlocks(RUN, passedFirstN(12));
    expect(blocks[0].passedCount).toBe(12);
    expect(blocks[0].state).toBe("current");
  });
});

describe("checkStatus", () => {
  it("mid-block: surahs to go until the check", () => {
    const p = passedFirstN(12);
    expect(checkStatus(hizbBlocks(RUN, p), p))
      .toEqual({ kind: "toGo", hizb: 60, remaining: 16 });
  });
  it("block finished, next untouched: ready for the check", () => {
    const p = passedFirstN(28);
    expect(checkStatus(hizbBlocks(RUN, p), p))
      .toEqual({ kind: "ready", hizb: 60 });
  });
  it("next block started: back to counting down", () => {
    const p = passedFirstN(29);
    expect(checkStatus(hizbBlocks(RUN, p), p))
      .toEqual({ kind: "toGo", hizb: 59, remaining: 8 });
  });
  it("whole run passed: done", () => {
    const p = passedFirstN(43);
    expect(checkStatus(hizbBlocks(RUN, p), p)).toEqual({ kind: "done" });
  });
  it("no blocks: null", () => {
    expect(checkStatus([], new Set())).toBeNull();
  });
  it("returning student at a boundary is NOT told to redo last year's check", () => {
    // start_surah 86: hizb 60 is complete only via assumedPassed, zero real records
    const list = RUN.slice(28); // 86 downwards
    const assumed = assumedPassed(RUN, list, new Set());
    expect(checkStatus(hizbBlocks(RUN, assumed), new Set()))
      .toEqual({ kind: "toGo", hizb: 59, remaining: 9 });
  });
  it("a real finished block still reports ready when earned records back it", () => {
    const earned = passedFirstN(28);
    expect(checkStatus(hizbBlocks(RUN, earned), earned))
      .toEqual({ kind: "ready", hizb: 60 });
  });
  it("returning student who finishes their first block this year IS ready", () => {
    // start 100: surahs 114..101 assumed from last year; this year they pass 100..87
    const list = RUN.slice(14); // starts at surah 100
    const earned = new Set(list.slice(0, 14).map((s) => s.number)); // 100..87 — completes hizb 60
    const assumed = assumedPassed(RUN, list, earned);
    expect(checkStatus(hizbBlocks(RUN, assumed), earned))
      .toEqual({ kind: "ready", hizb: 60 });
  });
});

describe("juzProgress", () => {
  it("in Juz 'Amma the denominator is 37", () => {
    const p = juzProgress(RUN, RUN, passedFirstN(12));
    expect(p).toMatchObject({ juz: 30, passed: 12, total: 37 });
  });
  it("in Tabarak the denominator is the run's 6, not the juz's 11", () => {
    const p = juzProgress(RUN, RUN, passedFirstN(38)); // current = surah 76
    expect(p).toMatchObject({ juz: 29, passed: 1, total: 6 });
  });
  it("all passed: reports the final juz complete", () => {
    const p = juzProgress(RUN, RUN, passedFirstN(43));
    expect(p).toMatchObject({ juz: 29, passed: 6, total: 6 });
  });
  it("empty list: null", () => {
    expect(juzProgress(RUN, [], new Set())).toBeNull();
  });
});

describe("rowPlan", () => {
  it("keeps kept rows and collapses hidden runs of 3+", () => {
    expect(rowPlan(8, new Set([0, 1, 7]))).toEqual([
      { kind: "node", index: 0 },
      { kind: "node", index: 1 },
      { kind: "gap", count: 5 },
      { kind: "node", index: 7 },
    ]);
  });
  it("renders short hidden runs (<3) as nodes — a gap row would be sillier", () => {
    expect(rowPlan(4, new Set([0, 3]))).toEqual([
      { kind: "node", index: 0 },
      { kind: "node", index: 1 },
      { kind: "node", index: 2 },
      { kind: "node", index: 3 },
    ]);
  });
});

describe("rowPlan boundaries", () => {
  it("zero rows", () => {
    expect(rowPlan(0, new Set())).toEqual([]);
  });
  it("nothing kept: one gap", () => {
    expect(rowPlan(5, new Set())).toEqual([{ kind: "gap", count: 5 }]);
  });
  it("everything kept: all nodes", () => {
    expect(rowPlan(3, new Set([0, 1, 2]))).toEqual([
      { kind: "node", index: 0 },
      { kind: "node", index: 1 },
      { kind: "node", index: 2 },
    ]);
  });
});

describe("structure invariants", () => {
  it("hizb pairs tile their juz exactly — the two tables can't drift apart", () => {
    for (const j of JUZ_BOUNDS) {
      const hs = HIZB_BOUNDS.filter((h) => Math.ceil(h.hizb / 2) === j.juz)
        .sort((a, b) => a.from - b.from);
      expect(hs).toHaveLength(2);
      expect(hs[0].from).toBe(j.from);
      expect(hs.at(-1)!.to).toBe(j.to);
      expect(hs[1].from).toBe(hs[0].to + 1); // contiguous, no overlap
    }
  });
});
