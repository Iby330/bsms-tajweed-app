import { describe, it, expect } from "vitest";
import { surahHeaderGlyph } from "./surah-header";

describe("surahHeaderGlyph", () => {
  it("maps the documented anchors", () => {
    expect(surahHeaderGlyph(1)).toBe(String.fromCodePoint(0xfc45));
    expect(surahHeaderGlyph(114)).toBe(String.fromCodePoint(0xfbeb));
  });
  it("crosses the block boundary at surah 22", () => {
    expect(surahHeaderGlyph(21)).toBe(String.fromCodePoint(0xfc64));
    expect(surahHeaderGlyph(22)).toBe(String.fromCodePoint(0xfb51));
  });
  it("returns null outside 1..114", () => {
    expect(surahHeaderGlyph(0)).toBeNull();
    expect(surahHeaderGlyph(115)).toBeNull();
  });
});
