import { describe, it, expect } from "vitest";
import { fromRow, groupIntoPages, isCenteredLine, wordKey, type QuranWord } from "./mushaf";

describe("isCenteredLine", () => {
  it("centres the print's closing lines", () => {
    expect(isCenteredLine(604, 15)).toBe(true);
    expect(isCenteredLine(586, 1)).toBe(true);
  });
  it("stretches everything else", () => {
    expect(isCenteredLine(604, 5)).toBe(false);
    expect(isCenteredLine(583, 7)).toBe(false);
  });
});

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", glyph: null, isEnd: false, page: 604, line: 12, ...over,
});

describe("wordKey", () => {
  it("is surah:ayah:position", () => {
    expect(wordKey({ surah: 114, ayah: 2, position: 3 })).toBe("114:2:3");
  });
});

describe("fromRow", () => {
  it("maps DB column names to the word shape", () => {
    expect(fromRow({
      surah_number: 114, ayah_number: 1, word_position: 5,
      text_uthmani: "١", code_v1: "ﭓ", is_end: true, page_number: 604, line_number: 12,
    })).toEqual({ surah: 114, ayah: 1, position: 5, text: "١", glyph: "ﭓ", isEnd: true, page: 604, line: 12 });
  });
});

describe("groupIntoPages", () => {
  it("returns no pages for no words", () => {
    expect(groupIntoPages([])).toEqual([]);
  });
  it("groups consecutive words into lines and pages, preserving order", () => {
    const words = [
      w({ position: 1, line: 12 }), w({ position: 2, line: 12 }),
      w({ ayah: 2, position: 1, line: 13 }),
      w({ ayah: 3, position: 1, page: 605, line: 1 }),
    ];
    const pages = groupIntoPages(words);
    expect(pages.map((p) => p.page)).toEqual([604, 605]);
    expect(pages[0].lines.map((l) => l.line)).toEqual([12, 13]);
    expect(pages[0].lines[0].words.map((x) => x.position)).toEqual([1, 2]);
    expect(pages[1].lines[0].words[0].ayah).toBe(3);
  });
});
