import { describe, expect, it } from "vitest";
import { captureProblem } from "./capture";

describe("captureProblem", () => {
  it("refuses an empty file whatever the timer said", () => {
    expect(captureProblem(0, 47, null)).toBe("empty");
  });

  it("refuses a recording far shorter than the timer (Arman: 23s timed, under 1s kept)", () => {
    expect(captureProblem(15198, 23, 0.8)).toBe("short");
  });

  it("accepts a recording about as long as the timer", () => {
    expect(captureProblem(300000, 24, 23.6)).toBeNull();
  });

  it("does not judge a very short recording on length", () => {
    expect(captureProblem(15000, 2, 0.8)).toBeNull();
  });

  it("does not refuse audio it could not decode", () => {
    expect(captureProblem(15000, 23, null)).toBeNull();
  });
});
