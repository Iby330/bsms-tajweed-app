import { describe, expect, it } from "vitest";
import { formOf, isDirty, parseForm, previewOf, type SavedTargets } from "./targets-form";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";

const SAVED: SavedTargets = {
  target: DEFAULT_CLASS_TARGET,
  overrides: [{ studentId: "s1", hizb: 5, juz: 8, surah10: null, note: "Joined late" }],
};

describe("targets form", () => {
  it("round-trips the saved targets, blank boxes for class values", () => {
    const f = formOf(SAVED);
    expect(f).toMatchObject({ ideal: "10", good: "15", acceptable: "20", hizb: "3", juz: "5", surah10: "3" });
    expect(f.overrides).toEqual([{ studentId: "s1", hizb: "5", juz: "8", surah10: "", note: "Joined late" }]);
    expect(isDirty(f, SAVED)).toBe(false);
    expect(parseForm(f)).toMatchObject({ valid: true, target: DEFAULT_CLASS_TARGET, overrides: SAVED.overrides });
  });

  it("previews a valid edit and counts it as a change", () => {
    const f = { ...formOf(SAVED), ideal: "13" };
    expect(previewOf(f, SAVED).target.minutes.ideal).toBe(13);
    expect(isDirty(f, SAVED)).toBe(true);
  });

  it("keeps the saved target on screen while the edit is invalid, with the error", () => {
    const f = { ...formOf(SAVED), good: "8" };
    const p = parseForm(f);
    expect(p.valid).toBe(false);
    expect(p.targetError).toBe("Ideal, Good and Acceptable minutes must be in order.");
    expect(previewOf(f, SAVED).target).toEqual(DEFAULT_CLASS_TARGET);
    expect(parseForm({ ...formOf(SAVED), juz: "" }).targetError).toMatch(/whole number/);
    expect(parseForm({ ...formOf(SAVED), juz: "2.5" }).targetError).toMatch(/whole number/);
  });

  it("treats a bad override box as an error for that student, keeping their saved override", () => {
    const f = formOf(SAVED);
    f.overrides[0] = { ...f.overrides[0], juz: "-1" };
    const p = parseForm(f);
    expect(p.overrideErrors.s1).toMatch(/blank for the class value/);
    expect(previewOf(f, SAVED).overrides).toEqual(SAVED.overrides);
  });

  it("drops an empty override, so adding one is not a change, and removing one is", () => {
    const f = formOf(SAVED);
    f.overrides.push({ studentId: "s2", hizb: "", juz: "", surah10: "", note: " " });
    expect(parseForm(f).overrides.map((o) => o.studentId)).toEqual(["s1"]);
    expect(isDirty(f, SAVED)).toBe(false);
    expect(isDirty({ ...f, overrides: [] }, SAVED)).toBe(true);
    expect(previewOf({ ...f, overrides: [] }, SAVED).overrides).toEqual([]);
  });

  it("keeps a note-only override", () => {
    const f = { ...formOf(SAVED), overrides: [{ studentId: "s3", hizb: "", juz: "", surah10: "", note: "Watch the madd" }] };
    expect(parseForm(f).overrides).toEqual([{ studentId: "s3", hizb: null, juz: null, surah10: null, note: "Watch the madd" }]);
  });
});
