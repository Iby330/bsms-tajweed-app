import { describe, expect, it } from "vitest";
import { draftFromRef, EMPTY_DRAFT, readDraft, surahTag } from "./quran-ref-draft";

const d = (patch: Partial<typeof EMPTY_DRAFT>) => ({ ...EMPTY_DRAFT, ...patch });

describe("readDraft", () => {
  it("reads one ayah when only the first is given", () => {
    expect(readDraft(d({ surah: "31", from: "19" }))).toEqual({ ok: true, ref: { surah: 31, from_ayah: 19, to_ayah: 19 } });
  });

  it("reads a range and word bounds", () => {
    expect(readDraft(d({ surah: "112", from: "1", to: "4" }))).toEqual({ ok: true, ref: { surah: 112, from_ayah: 1, to_ayah: 4 } });
    expect(readDraft(d({ surah: "104", from: "1", to: "2", fromWord: "2", toWord: "3" }))).toEqual({
      ok: true,
      ref: { surah: 104, from_ayah: 1, to_ayah: 2, from_word: 2, to_word: 3 },
    });
  });

  it("says plainly what is wrong", () => {
    expect(readDraft(d({}))).toMatchObject({ ok: false, error: "Type the surah number, from 1 to 114." });
    expect(readDraft(d({ surah: "115", from: "1" }))).toMatchObject({ ok: false, error: "Surahs are numbered 1 to 114." });
    expect(readDraft(d({ surah: "31" }))).toMatchObject({ ok: false, error: "Type the ayah it starts at." });
    expect(readDraft(d({ surah: "31", from: "40" }))).toMatchObject({ ok: false, error: "Luqman has 34 ayat, so there is no ayah 40." });
    expect(readDraft(d({ surah: "31", from: "19", to: "18" }))).toMatchObject({ ok: false, error: "The last ayah comes before the first." });
    expect(readDraft(d({ surah: "31", from: "19", fromWord: "5", toWord: "2" }))).toMatchObject({ ok: false, error: "The last word comes before the first." });
    expect(readDraft(d({ surah: "31", from: "1.5" }))).toMatchObject({ ok: false });
  });
});

describe("draftFromRef", () => {
  it("round-trips, leaving 'to' blank for a single ayah", () => {
    const ref = { surah: 104, from_ayah: 1, to_ayah: 2, from_word: 2 };
    expect(readDraft(draftFromRef(ref))).toEqual({ ok: true, ref });
    expect(draftFromRef({ surah: 31, from_ayah: 19, to_ayah: 19 }).to).toBe("");
    expect(draftFromRef(null)).toEqual(EMPTY_DRAFT);
  });
});

describe("surahTag", () => {
  it("names the surah from the app's own list", () => {
    expect(surahTag("31")).toBe("31 · Luqman");
    expect(surahTag("0")).toBeNull();
    expect(surahTag("x")).toBeNull();
  });
});
