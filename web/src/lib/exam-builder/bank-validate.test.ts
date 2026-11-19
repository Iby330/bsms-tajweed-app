import { describe, expect, it } from "vitest";
import { cleanBankPatch, cleanUsedIn, isValidBankMarks, mcqProblem, splitReviewNote } from "./bank-validate";

describe("isValidBankMarks", () => {
  it("allows blank and halves from 0.5 to 100", () => {
    for (const ok of [null, 0.5, 1, 1.5, 100]) expect(isValidBankMarks(ok)).toBe(true);
    for (const bad of [0, 0.25, 100.5, -1, "1", undefined, NaN]) expect(isValidBankMarks(bad)).toBe(false);
  });
});

describe("cleanUsedIn", () => {
  it("trims, squeezes spaces, drops blanks and case-insensitive repeats", () => {
    expect(cleanUsedIn(["  EOT2   25/26", "", "eot2 25/26", "EOY 25/26"])).toEqual({
      ok: true, patch: ["EOT2 25/26", "EOY 25/26"],
    });
  });
  it("refuses too many, too long, or not text", () => {
    expect(cleanUsedIn(Array.from({ length: 21 }, (_, i) => `L${i}`)).ok).toBe(false);
    expect(cleanUsedIn(["x".repeat(41)]).ok).toBe(false);
    expect(cleanUsedIn([1]).ok).toBe(false);
    expect(cleanUsedIn("EOT1").ok).toBe(false);
  });
});

describe("cleanBankPatch", () => {
  it("keeps the fields it knows and drops the rest", () => {
    const r = cleanBankPatch({ prompt: " Why? ", marks: null, archived: true, created_by: "x" });
    expect(r).toEqual({ ok: true, patch: { prompt: "Why?", marks: null } });
  });
  it("checks options like a paper item does", () => {
    expect(cleanBankPatch({ options: Array.from({ length: 11 }, () => ({ text: "a" })) }).ok).toBe(false);
    expect(cleanBankPatch({ options: [{ text: "a", image: "../etc/passwd" }] }).ok).toBe(false);
    expect(cleanBankPatch({ options: [{ text: "a", image: "bank/ab.png", correct: true }] })).toEqual({
      ok: true, patch: { options: [{ text: "a", image: "bank/ab.png", correct: true }] },
    });
  });
  it("refuses an unknown review status and a blank topic", () => {
    expect(cleanBankPatch({ review_status: "done" }).ok).toBe(false);
    expect(cleanBankPatch({ topic_id: " " }).ok).toBe(false);
  });
  it("refuses a prompt over 4000 characters", () => {
    expect(cleanBankPatch({ prompt: "x".repeat(4001) }).ok).toBe(false);
  });
});

describe("mcqProblem", () => {
  const opt = (text: string, image: string | null = null) => ({ text, image, correct: false });
  it("wants two filled options for multiple choice only", () => {
    expect(mcqProblem("short", null)).toBeNull();
    expect(mcqProblem("mcq", [opt("a"), opt("b")])).toBeNull();
    expect(mcqProblem("mcq", [opt("a"), opt("", "bank/x.png")])).toBeNull();
    expect(mcqProblem("mcq", [opt("a"), opt(" ")])).not.toBeNull();
    expect(mcqProblem("mcq", null)).not.toBeNull();
  });
});

describe("splitReviewNote", () => {
  it("splits the merge's ' | ' joins", () => {
    expect(splitReviewNote("no answer in source | answer taken from G2-101")).toEqual([
      "no answer in source", "answer taken from G2-101",
    ]);
    expect(splitReviewNote(null)).toEqual([]);
  });
});
