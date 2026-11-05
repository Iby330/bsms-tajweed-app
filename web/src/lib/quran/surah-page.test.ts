import { describe, it, expect } from "vitest";
import { surahPage } from "./page-within";

const surah = { from: 600, to: 600 }; // a one-page surah
const reach = { from: 562, to: 604 };

describe("surahPage", () => {
  it("opens on the surah's first page when nothing is asked", () => {
    expect(surahPage(undefined, surah, reach)).toBe(600);
    expect(surahPage("x", surah, reach)).toBe(600);
  });
  // The arrows used to stop at the surah's own pages, so a one-page surah
  // could not turn at all.
  it("turns past the surah, anywhere the reader's mushaf reaches", () => {
    expect(surahPage("601", surah, reach)).toBe(601);
    expect(surahPage("570", surah, reach)).toBe(570);
  });
  it("clamps to the reader's mushaf", () => {
    expect(surahPage("1", surah, reach)).toBe(562);
    expect(surahPage("700", surah, reach)).toBe(604);
  });
});
