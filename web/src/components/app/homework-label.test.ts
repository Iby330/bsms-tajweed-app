import { describe, it, expect } from "vitest";
import { homeworkLabel } from "./homework-row";

describe("homeworkLabel", () => {
  it("core tajweed papers keep their number", () => {
    expect(homeworkLabel(3, "tajweed")).toBe("Homework 3");
  });
  it("a hundred-block series counts from 1 within its block", () => {
    expect(homeworkLabel(102, "tfp")).toBe("TFP 2");
    expect(homeworkLabel(201, "umm_al_kitab")).toBe("Umm al-Kitāb 1");
    expect(homeworkLabel(209, "umm_al_kitab")).toBe("Umm al-Kitāb 9");
  });
});
