import { describe, it, expect } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps an in-app path, query and hash included", () => {
    expect(safeNext("/homework/3")).toBe("/homework/3");
    expect(safeNext("/welcome")).toBe("/welcome");
    expect(safeNext("/hifdh?tab=pairs#today")).toBe("/hifdh?tab=pairs#today");
  });

  it("falls back when there is nothing to follow", () => {
    expect(safeNext(null)).toBe("/home");
    expect(safeNext(undefined)).toBe("/home");
    expect(safeNext("")).toBe("/home");
  });

  it("honours a caller's own fallback", () => {
    expect(safeNext("https://evil.com", "/teacher/home")).toBe("/teacher/home");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of [
      "https://evil.com",
      "evil.com",
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      "/\x00/evil.com",
      "javascript:alert(1)",
    ]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe("/home");
    }
  });
});
