import { describe, expect, it } from "vitest";
import { arabicNumber, isTapWords, parseLocator, tapAyahs, type TapOption } from "./tap-words";

const word = (position: number, label: string, value = "كَلِمَة"): TapOption => ({
  position,
  label,
  value,
});

/** A passage: 78:12 has two words here, 78:13 has three. */
const passage: TapOption[] = [
  word(1, "78:12:1"),
  word(2, "78:12:2"),
  word(3, "78:13:1"),
  word(4, "78:13:2"),
  word(5, "78:13:3"),
];

describe("parseLocator", () => {
  it("reads surah, ayah and word position", () => {
    expect(parseLocator("78:14:3")).toEqual({ surah: 78, ayah: 14, position: 3 });
  });

  it("tolerates surrounding space", () => {
    expect(parseLocator(" 2:255:1 ")).toEqual({ surah: 2, ayah: 255, position: 1 });
  });

  it("refuses anything that is not three numbers", () => {
    for (const label of ["Option 1", "78:14", "78:14:3:1", "a:b:c", "", "78-14-3"]) {
      expect(parseLocator(label)).toBeNull();
    }
  });
});

describe("isTapWords", () => {
  it("recognises a passage", () => {
    expect(isTapWords(passage)).toBe(true);
  });

  it("leaves ordinary checkbox options alone", () => {
    expect(
      isTapWords([
        word(1, "Option 1", "Iẓhār"),
        word(2, "Option 2", "Idghām"),
        word(3, "Option 3", "Iqlāb"),
        word(4, "Option 4", "Ikhfā’"),
        word(5, "Option 5", "None"),
      ]),
    ).toBe(false);
  });

  it("needs every label to be a locator, not just most", () => {
    expect(isTapWords([...passage.slice(0, 4), word(5, "Option 5")])).toBe(false);
  });

  it("refuses a run too short to be a passage", () => {
    expect(isTapWords(passage.slice(0, 4))).toBe(false);
  });

  it("is false for no options at all", () => {
    expect(isTapWords(null)).toBe(false);
    expect(isTapWords([])).toBe(false);
  });
});

describe("tapAyahs", () => {
  it("groups words under their ayah, in reading order", () => {
    const ayahs = tapAyahs(passage);
    expect(ayahs.map((a) => a.ayah)).toEqual([12, 13]);
    expect(ayahs[0].words.map((w) => w.position)).toEqual([1, 2]);
    expect(ayahs[1].words.map((w) => w.position)).toEqual([3, 4, 5]);
  });

  it("orders by option position, which is what marking refers to", () => {
    const shuffled = [passage[4], passage[0], passage[3], passage[2], passage[1]];
    expect(tapAyahs(shuffled).map((a) => a.words.map((w) => w.position))).toEqual([
      [1, 2],
      [3, 4, 5],
    ]);
  });

  it("starts a new group when the same ayah returns later", () => {
    // a passage that crosses a surah and comes back would otherwise merge
    const across = [word(1, "78:12:1"), word(2, "79:1:1"), word(3, "78:12:2")];
    expect(tapAyahs(across).map((a) => `${a.surah}:${a.ayah}`)).toEqual([
      "78:12",
      "79:1",
      "78:12",
    ]);
  });

  it("drops a word whose label will not parse rather than guessing", () => {
    const ayahs = tapAyahs([...passage, word(6, "not-a-locator")]);
    expect(ayahs.flatMap((a) => a.words)).toHaveLength(5);
  });
});

describe("arabicNumber", () => {
  it("prints the ayah number as the mushaf does", () => {
    expect(arabicNumber(14)).toBe("١٤");
    expect(arabicNumber(7)).toBe("٧");
    expect(arabicNumber(100)).toBe("١٠٠");
  });
});
