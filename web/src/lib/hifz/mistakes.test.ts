import { describe, it, expect } from "vitest";
import {
  aggregateFlags, aggregatePatterns, heatClass, wordHeat,
  type MistakeRow, type SessionRow,
} from "./mistakes";

const NOW = new Date("2026-08-14T12:00:00Z");
const m = (over: Partial<MistakeRow>): MistakeRow => ({
  id: "m1", session_id: "s1", surah_number: 114, ayah_number: 1, word_position: 2,
  category: "tajweed", detail: "ikhfa", note: null, created_at: "2026-08-10T10:00:00Z", ...over,
});

describe("aggregatePatterns", () => {
  it("groups by category+detail with counts, surah spread and recency", () => {
    const rows = [
      m({ id: "a" }),
      m({ id: "b", surah_number: 112, created_at: "2026-05-01T10:00:00Z" }),
      m({ id: "c", category: "makhraj", detail: "ض" }),
    ];
    const out = aggregatePatterns(rows, NOW);
    expect(out).toHaveLength(2);
    const ikhfa = out.find((p) => p.detail === "ikhfa")!;
    expect(ikhfa.total).toBe(2);
    expect(ikhfa.recent).toBe(1); // May is outside the 28-day window
    expect(ikhfa.surahs).toEqual([114, 112]);
    expect(ikhfa.label).toBe("Tajweed — Ikhfa");
  });
  it("sorts most recently active first", () => {
    const out = aggregatePatterns(
      [m({ id: "old", detail: "madd", created_at: "2026-01-01T00:00:00Z" }), m({ id: "new" })],
      NOW,
    );
    expect(out[0].detail).toBe("ikhfa");
  });
});

describe("aggregateFlags", () => {
  it("counts flags over the last five submitted sessions", () => {
    const s = (id: string, at: string, flags: string[]): SessionRow =>
      ({ id, submitted_at: at, flags, overall_note: null });
    const out = aggregateFlags([
      s("1", "2026-08-01T00:00:00Z", ["weak_hifz"]),
      s("2", "2026-08-08T00:00:00Z", ["weak_hifz", "halting"]),
      s("3", "2026-08-13T00:00:00Z", []),
    ]);
    expect(out[0]).toMatchObject({ flag: "weak_hifz", count: 2, ofLast: 3 });
  });
  it("ignores drafts", () => {
    expect(
      aggregateFlags([{ id: "d", submitted_at: null, flags: ["weak_hifz"], overall_note: null }]),
    ).toEqual([]);
  });
});

describe("wordHeat", () => {
  it("weights recent mistakes double", () => {
    const heat = wordHeat([m({}), m({ id: "old2", created_at: "2026-01-01T00:00:00Z" })], NOW);
    expect(heat["114:1:2"]).toBe(3); // 2 recent + 1 old
  });
});

describe("heatClass", () => {
  it("maps intensity to tint classes", () => {
    expect(heatClass(0)).toBe("");
    expect(heatClass(2)).toBe("bg-warn/20");
    expect(heatClass(4)).toBe("bg-warn/40");
    expect(heatClass(7)).toBe("bg-danger/40");
  });
});
