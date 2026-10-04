import { describe, expect, it } from "vitest";
import { isDiagram, regionOf, REGIONS } from "./diagram";
import { isTapLetters, parseLetter, tapLetterWords } from "./tap-letters";
import { isTapWords } from "./tap-words";
import { isChoiceGrid } from "./choice-grid";

describe("diagram", () => {
  const places = Object.keys(REGIONS).map((r, i) => ({ position: i, label: `diagram:${r}`, value: "" }));

  it("reads a region", () => {
    expect(regionOf("diagram:lips")).toBe("lips");
    expect(regionOf("diagram:elbow")).toBeNull();
    expect(regionOf("Option A")).toBeNull();
  });

  it("recognises a question whose options are all places", () => {
    expect(isDiagram(places)).toBe(true);
    expect(isDiagram([...places, { position: 99, label: "Option A", value: "" }])).toBe(false);
    expect(isDiagram(null)).toBe(false);
  });
});

describe("tap letters", () => {
  // 1:6 ٱهْدِنَا ٱلصِّرَٰطَ, as letters (a passage is longer; this is enough).
  const L = (position: number, label: string, value: string) => ({ position, label, value });
  const letters = [
    L(1, "L:1:6:1:1", "ٱ"), L(2, "L:1:6:1:2", "هْ"), L(3, "L:1:6:1:3", "دِ"), L(4, "L:1:6:1:4", "نَ"), L(5, "L:1:6:1:5", "ا"),
    L(6, "L:1:6:2:1", "ٱ"), L(7, "L:1:6:2:2", "ل"), L(8, "L:1:6:2:3", "صِّ"), L(9, "L:1:6:2:4", "رَٰ"), L(10, "L:1:6:2:5", "طَ"),
    L(11, "L:1:7:1:1", "صِ"), L(12, "L:1:7:1:2", "رَٰ"), L(13, "L:1:7:1:3", "طَ"),
  ];

  it("reads a letter's place", () => {
    expect(parseLetter("L:1:6:2:3")).toEqual({ surah: 1, ayah: 6, word: 2, letter: 3 });
    expect(parseLetter("1:6:2")).toBeNull();
  });

  it("is told apart from every other kind of question", () => {
    expect(isTapLetters(letters)).toBe(true);
    expect(isTapWords(letters)).toBe(false);
    expect(isChoiceGrid(letters)).toBe(false);
    expect(isDiagram(letters)).toBe(false);
  });

  it("groups the letters into words and marks where each ayah ends", () => {
    const words = tapLetterWords(letters);
    expect(words.map((w) => w.letters.map((l) => l.value).join(""))).toEqual(["ٱهْدِنَا", "ٱلصِّرَٰطَ", "صِرَٰطَ"]);
    expect(words.map((w) => w.endsAyah)).toEqual([false, true, true]);
  });
});
