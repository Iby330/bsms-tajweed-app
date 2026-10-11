import { describe, expect, it } from "vitest";
import { seatDaggerAlif } from "./text";

describe("seatDaggerAlif", () => {
  it("drops the tatweel in front of every dagger alif", () => {
    expect(seatDaggerAlif("ٱلنَّفَّـٰثَـٰتِ")).toBe("ٱلنَّفَّٰثَٰتِ");
    expect(seatDaggerAlif("يَـٰٓأَيُّهَا")).toBe("يَٰٓأَيُّهَا");
  });

  it("leaves a tatweel that carries nothing alone, and text without one", () => {
    expect(seatDaggerAlif("ثَـ")).toBe("ثَـ");
    expect(seatDaggerAlif("Option A: حَمَّالَةَ")).toBe("Option A: حَمَّالَةَ");
  });
});
