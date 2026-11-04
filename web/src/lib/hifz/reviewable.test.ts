import { describe, expect, it } from "vitest";
import { reviewableSurahs } from "./reviewable";

const list = [114, 113, 112, 111].map((number) => ({ number }));

describe("reviewableSurahs", () => {
  it("is passed plus current for the programme", () => {
    const out = reviewableSurahs(list, new Set([114]), "brothers");
    expect(out.map((s) => s.number)).toEqual([114, 113]);
    expect(out[1]).toMatchObject({ passed: false, current: true });
  });
  it("is the whole list for the ustadhs, with the first unpassed still current", () => {
    const out = reviewableSurahs(list, new Set([114]), "ustadhs");
    expect(out.map((s) => s.number)).toEqual([114, 113, 112, 111]);
    expect(out.filter((s) => s.current).map((s) => s.number)).toEqual([113]);
  });
});
