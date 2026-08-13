import { describe, it, expect } from "vitest";
import { parseMarkInput } from "./logic";

/**
 * The marking screen types marks into a plain text field, so `min`/`max`/`step`
 * no longer police them — this does.
 */
describe("parseMarkInput", () => {
  it("reads a whole number and a half mark", () => {
    expect(parseMarkInput("3", 5)).toEqual({ value: 3, valid: true });
    expect(parseMarkInput("2.5", 5)).toEqual({ value: 2.5, valid: true });
  });

  it("accepts a leading decimal point", () => {
    expect(parseMarkInput(".5", 5)).toEqual({ value: 0.5, valid: true });
  });

  it("accepts a trailing decimal point mid-typing", () => {
    // "2." is what the field holds for one keystroke on the way to "2.5"
    expect(parseMarkInput("2.", 5)).toEqual({ value: 2, valid: true });
  });

  it("treats blank as not marked yet, not as an error", () => {
    expect(parseMarkInput("", 5)).toEqual({ value: null, valid: true });
    expect(parseMarkInput("   ", 5)).toEqual({ value: null, valid: true });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseMarkInput(" 4 ", 5)).toEqual({ value: 4, valid: true });
  });

  it("accepts both ends of the range", () => {
    expect(parseMarkInput("0", 5)).toEqual({ value: 0, valid: true });
    expect(parseMarkInput("5", 5)).toEqual({ value: 5, valid: true });
  });

  it("flags a mark above the question's points", () => {
    expect(parseMarkInput("9", 5)).toEqual({ value: 9, valid: false });
  });

  it("keeps the too-high number rather than clamping it", () => {
    // the teacher sees what they typed, flagged — nothing is silently rewritten
    expect(parseMarkInput("50", 5).value).toBe(50);
  });

  it("rejects text, and reports no value for it", () => {
    // a sign is not part of a mark, so "-1" is unparseable rather than
    // an out-of-range number
    for (const raw of ["abc", "2a", "1.2.3", "-1", "--1", ".", "1e3", "٢"]) {
      expect(parseMarkInput(raw, 5)).toEqual({ value: null, valid: false });
    }
  });
});
