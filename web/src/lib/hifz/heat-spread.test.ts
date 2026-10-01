import { describe, it, expect } from "vitest";
import { spreadHeat } from "./heat-spread";
import type { QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "./mistakes";

const w = (position: number, isEnd = false): QuranWord => ({
  surah: 114, ayah: 1, position, text: "x", glyph: null, isEnd, page: 604, line: 1,
});
const m = (over: Partial<MistakeRow>): MistakeRow => ({
  id: "m", session_id: "s", surah_number: 114, ayah_number: 1, word_position: 1,
  category: "hifz", detail: "forgot", note: null, created_at: "2026-09-10T00:00:00Z", ...over,
});
const now = new Date("2026-09-15T00:00:00Z");

describe("spreadHeat", () => {
  it("tints a mis-read word and gives it a history", () => {
    const { heat, history } = spreadHeat([w(1), w(2)], [m({})], now);
    expect(heat["114:1:1"]).toBe("bg-warn/20");
    expect(heat["114:1:2"]).toBeUndefined();
    expect(history["114:1:1"]).toEqual([
      { label: "Hifdh: Forgot it", note: null, date: "2026-09-10T00:00:00Z" },
    ]);
    expect(history["114:1:2"]).toBeUndefined();
  });

  it("spreads an ayah-scoped mistake over every word of the ayah, marker included", () => {
    const { heat, history } = spreadHeat([w(1), w(2, true)], [m({ word_position: null })], now);
    expect(heat["114:1:1"]).toBe("bg-warn/20");
    expect(heat["114:1:2"]).toBe("bg-warn/20");
    expect(history["114:1:2"][0].label).toBe("Hifdh: Forgot it · whole ayah");
  });

  it("adds a word's own mistake to its ayah's, so both together read hotter", () => {
    const { heat } = spreadHeat([w(1)], [m({}), m({ id: "b", word_position: null })], now);
    expect(heat["114:1:1"]).toBe("bg-warn/40");
  });

  it("orders a word's history newest first", () => {
    const { history } = spreadHeat(
      [w(1)],
      [m({ id: "old", created_at: "2026-08-01T00:00:00Z" }), m({ id: "new", created_at: "2026-09-10T00:00:00Z" })],
      now,
    );
    expect(history["114:1:1"].map((e) => e.date)).toEqual(["2026-09-10T00:00:00Z", "2026-08-01T00:00:00Z"]);
  });

  it("returns empty heat and history when there are no mistakes", () => {
    expect(spreadHeat([w(1), w(2)], [], now)).toEqual({ heat: {}, history: {} });
  });

  it("gives a word both its own and its ayah's history entries, newest first", () => {
    const { history } = spreadHeat(
      [w(1)],
      [
        m({ id: "word", detail: "forgot", created_at: "2026-08-01T00:00:00Z" }),
        m({ id: "ayah", word_position: null, detail: "swapped", created_at: "2026-09-10T00:00:00Z" }),
      ],
      now,
    );
    expect(history["114:1:1"].map((e) => e.date)).toEqual([
      "2026-09-10T00:00:00Z",
      "2026-08-01T00:00:00Z",
    ]);
    expect(history["114:1:1"].map((e) => e.label)).toEqual([
      "Hifdh: Swapped / wrong · whole ayah",
      "Hifdh: Forgot it",
    ]);
  });
});
