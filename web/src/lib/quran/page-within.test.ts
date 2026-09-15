import { describe, it, expect } from "vitest";
import { pageWithin } from "./page-within";

const range = { from: 591, to: 593 };

describe("pageWithin", () => {
  it("opens on the first page when nothing was asked for", () => {
    expect(pageWithin(undefined, range)).toBe(591);
    expect(pageWithin("", range)).toBe(591);
    expect(pageWithin("abc", range)).toBe(591);
  });
  it("keeps a page inside the range", () => {
    expect(pageWithin("592", range)).toBe(592);
  });
  it("clamps a page outside it", () => {
    expect(pageWithin("580", range)).toBe(591);
    expect(pageWithin("604", range)).toBe(593);
  });
});
