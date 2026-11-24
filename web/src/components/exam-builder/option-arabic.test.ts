import { describe, expect, it } from "vitest";
import { blankOption, readOption, toFormOption } from "./option-arabic";

describe("readOption", () => {
  it("a typeset option saves its ref, and keeps a picture it had as the fallback", () => {
    const o = toFormOption({ text: "", image: "bank/a.png", correct: true });
    const typed = { ...o, arabic: { ...o.arabic, mode: "typeset" as const, draft: { surah: "2", from: "8", to: "", fromWord: "3", toWord: "3" } } };
    expect(readOption(typed, 1)).toEqual({
      ok: true,
      option: { text: "", image: "bank/a.png", correct: true, quran: { surah: 2, from_ayah: 8, to_ayah: 8, from_word: 3, to_word: 3 } },
    });
  });

  it("says which option's ayah is wrong", () => {
    const o = blankOption();
    const typed = { ...o, arabic: { ...o.arabic, mode: "typeset" as const } };
    expect(readOption(typed, 3)).toMatchObject({ ok: false, error: expect.stringMatching(/^Option 3, typeset ayah: /) });
  });

  it("Picture drops the ref, and No Arabic drops the picture too", () => {
    const o = toFormOption({ text: "x", image: "new/me/a.png", correct: false, quran: { surah: 1, from_ayah: 1, to_ayah: 1 } });
    expect(o.arabic.mode).toBe("typeset");
    expect(readOption({ ...o, arabic: { ...o.arabic, mode: "picture" } }, 1)).toEqual({ ok: true, option: { text: "x", image: "new/me/a.png", correct: false } });
    expect(readOption({ ...o, arabic: { ...o.arabic, mode: "none" } }, 1)).toEqual({ ok: true, option: { text: "x", image: null, correct: false } });
  });

  it("keeps the circle an imported option had while the range is unchanged", () => {
    const circle = { word: 1, x: 0.5, w: 0.2 };
    const o = toFormOption({ text: "", image: null, correct: false, quran: { surah: 112, from_ayah: 1, to_ayah: 1, circle } });
    expect(readOption(o, 1)).toMatchObject({ ok: true, option: { quran: { circle } } });
  });
});
