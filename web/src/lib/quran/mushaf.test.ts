import { describe, it, expect } from "vitest";
import { fromRow, groupIntoPages, isCenteredLine, pageSlots, wordKey, type QuranWord } from "./mushaf";

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
      text_uthmani: "١", code_v1: "ﭓ", code_v2: "ﱂ", is_end: true, page_number: 604, line_number: 12,
    })).toEqual({ surah: 114, ayah: 1, position: 5, text: "١", glyph: "ﭓ", isEnd: true, page: 604, line: 12 });
  });
});

describe("pageSlots", () => {
  const line = (n: number, words: QuranWord[]) => words.map((x) => ({ ...x, line: n }));
  const page = (words: QuranWord[]) => {
    const [pg] = groupIntoPages(words);
    return pg;
  };
  it("a full page is 15 word lines", () => {
    const words = Array.from({ length: 15 }, (_, i) => w({ ayah: 5, position: i + 1, line: i + 1 }));
    const slots = pageSlots(page(words));
    expect(slots).toHaveLength(15);
    expect(slots.every((s) => s.type === "words")).toBe(true);
  });
  it("two gaps before opening words = header then basmala", () => {
    const words = [
      ...line(1, [w({ surah: 78, ayah: 40, position: 1 })]),
      ...line(4, [w({ surah: 79, ayah: 1, position: 1 })]),
      ...Array.from({ length: 11 }, (_, i) => w({ surah: 79, ayah: 2, position: i + 1, line: i + 5 })),
    ];
    const slots = pageSlots(page(words));
    expect(slots).toHaveLength(15);
    expect(slots[1]).toEqual({ type: "header", surah: 79 });
    expect(slots[2]).toEqual({ type: "basmala" });
  });
  it("a single leading gap is the basmala of a header on the previous page", () => {
    const words = [
      ...line(2, [w({ surah: 80, ayah: 1, position: 1 })]),
      ...Array.from({ length: 13 }, (_, i) => w({ surah: 80, ayah: 2, position: i + 1, line: i + 3 })),
    ];
    const slots = pageSlots(page(words));
    expect(slots[0]).toEqual({ type: "basmala" });
    expect(slots).toHaveLength(15);
  });
  it("trailing gaps announce the next surah: header, then basmala", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) =>
      w({ surah: 84, ayah: 20, position: i + 1, line: i + 1 }),
    );
    const slots = pageSlots(page(thirteen));
    expect(slots[13]).toEqual({ type: "header", surah: 85 });
    expect(slots[14]).toEqual({ type: "basmala" });
  });
  it("a single trailing gap is a header alone", () => {
    const fourteen = Array.from({ length: 14 }, (_, i) =>
      w({ surah: 90, ayah: 3, position: i + 1, line: i + 1 }),
    );
    const slots = pageSlots(page(fourteen));
    expect(slots[14]).toEqual({ type: "header", surah: 91 });
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
