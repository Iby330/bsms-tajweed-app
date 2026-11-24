import { describe, expect, it } from "vitest";
import {
  answerLinesFor, cleanItemPatch, cleanPaperPatch, cleanSectionPatch, isImagePath, isUuid, isValidMarks, moved,
  renumbered,
} from "./validate";

const ID = "11111111-1111-4111-8111-111111111111";

describe("isUuid", () => {
  it("accepts a uuid in either case and nothing else", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    expect(isUuid("x),or(id.neq.0")).toBe(false);
    expect(isUuid(`${ID} `)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("cleanPaperPatch", () => {
  it("trims and keeps only the header fields", () => {
    expect(cleanPaperPatch({ title: "  End Of Term 1 Exam ", code: " EOT1", season: "26/27 ", owner_id: ID, status: "final" }))
      .toEqual({ ok: true, patch: { title: "End Of Term 1 Exam", code: "EOT1", season: "26/27" } });
  });

  it("allows a blank date or duration but not a blank title, code or season", () => {
    expect(cleanPaperPatch({ date_label: "  ", duration_label: "" })).toEqual({ ok: true, patch: { date_label: "", duration_label: "" } });
    expect(cleanPaperPatch({ title: "  " })).toEqual({ ok: false, error: "The paper needs a title." });
    expect(cleanPaperPatch({ code: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/code/) });
    expect(cleanPaperPatch({ season: " " })).toMatchObject({ ok: false, error: expect.stringMatching(/season/) });
  });

  it("refuses over-long values rather than cutting them", () => {
    expect(cleanPaperPatch({ title: "x".repeat(200) }).ok).toBe(true);
    expect(cleanPaperPatch({ title: "x".repeat(201) })).toMatchObject({ ok: false });
    expect(cleanPaperPatch({ duration_label: "x".repeat(61) })).toMatchObject({ ok: false, error: expect.stringMatching(/60/) });
  });

  it("trims notes, drops blank lines and caps them at 12 of 400 characters", () => {
    expect(cleanPaperPatch({ notes: [" One ", "", "  ", "Two"] })).toEqual({ ok: true, patch: { notes: ["One", "Two"] } });
    expect(cleanPaperPatch({ notes: [] })).toEqual({ ok: true, patch: { notes: [] } });
    expect(cleanPaperPatch({ notes: Array(13).fill("n") })).toMatchObject({ ok: false });
    expect(cleanPaperPatch({ notes: ["x".repeat(401)] })).toMatchObject({ ok: false });
    expect(cleanPaperPatch({ notes: "one line" })).toMatchObject({ ok: false });
    expect(cleanPaperPatch({ notes: [1] })).toMatchObject({ ok: false });
  });

  it("trims the paper name, allows it blank and refuses one over 60 characters", () => {
    expect(cleanPaperPatch({ name: "  Advanced " })).toEqual({ ok: true, patch: { name: "Advanced" } });
    expect(cleanPaperPatch({ name: "   " })).toEqual({ ok: true, patch: { name: "" } });
    expect(cleanPaperPatch({ name: "x".repeat(60) })).toEqual({ ok: true, patch: { name: "x".repeat(60) } });
    expect(cleanPaperPatch({ name: "x".repeat(61) })).toEqual({ ok: false, error: "The paper name can be at most 60 characters." });
    expect(cleanPaperPatch({ name: 5 })).toEqual({ ok: false, error: "The paper name must be text." });
  });

  it("refuses wrong types and empty patches", () => {
    expect(cleanPaperPatch({ title: 5 })).toMatchObject({ ok: false });
    expect(cleanPaperPatch({})).toEqual({ ok: false, error: "Nothing to change." });
    expect(cleanPaperPatch(null)).toMatchObject({ ok: false });
    expect(cleanPaperPatch({ owner_id: ID })).toMatchObject({ ok: false });
  });
});

describe("cleanSectionPatch", () => {
  it("trims a title and refuses a blank one", () => {
    expect(cleanSectionPatch({ title: " Section A " }, false)).toEqual({ ok: true, patch: { title: "Section A" } });
    expect(cleanSectionPatch({ title: " " }, false)).toMatchObject({ ok: false });
  });

  it("only takes a table for a practical section, and checks it", () => {
    const table = { rows: 3, marks: 9, columns: [" Verse ", "Surah"] };
    expect(cleanSectionPatch({ practical: table }, false)).toMatchObject({ ok: false });
    expect(cleanSectionPatch({ practical: table }, true))
      .toEqual({ ok: true, patch: { practical: { rows: 3, marks: 9, columns: ["Verse", "Surah"] } } });
    expect(cleanSectionPatch({ practical: { ...table, rows: 0 } }, true)).toMatchObject({ ok: false });
    expect(cleanSectionPatch({ practical: { ...table, rows: 2.5 } }, true)).toMatchObject({ ok: false });
    expect(cleanSectionPatch({ practical: { ...table, marks: 9.25 } }, true)).toMatchObject({ ok: false });
    expect(cleanSectionPatch({ practical: { ...table, columns: [] } }, true)).toMatchObject({ ok: false });
    expect(cleanSectionPatch({ practical: { ...table, columns: ["", "x"] } }, true)).toMatchObject({ ok: false });
  });
});

describe("isImagePath", () => {
  it("takes bank/ and new/ paths and nothing that climbs out", () => {
    expect(isImagePath("bank/3f2a.png")).toBe(true);
    expect(isImagePath("new/11111111-1111-4111-8111-111111111111/a-b_c.jpg")).toBe(true);
    expect(isImagePath("avatars/me.png")).toBe(false);
    expect(isImagePath("bank/../avatars/me.png")).toBe(false);
    expect(isImagePath("bank/a b.png")).toBe(false);
    expect(isImagePath("/bank/a.png")).toBe(false);
  });
});

describe("isValidMarks", () => {
  it("is 0.5 to 100 in halves", () => {
    for (const ok of [0.5, 1, 1.5, 100]) expect(isValidMarks(ok)).toBe(true);
    for (const bad of [0, 0.25, -1, 100.5, NaN, Infinity, "2"]) expect(isValidMarks(bad)).toBe(false);
  });
});

describe("cleanItemPatch", () => {
  it("trims the prompt and refuses an empty or over-long one", () => {
    expect(cleanItemPatch({ prompt: "  What is Ghunna? " })).toEqual({ ok: true, patch: { prompt: "What is Ghunna?" } });
    expect(cleanItemPatch({ prompt: "  " })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ prompt: "x".repeat(4001) })).toMatchObject({ ok: false });
  });

  it("turns a blank answer into null", () => {
    expect(cleanItemPatch({ answer: "  " })).toEqual({ ok: true, patch: { answer: null } });
    expect(cleanItemPatch({ answer: null })).toEqual({ ok: true, patch: { answer: null } });
    expect(cleanItemPatch({ answer: " Ikhfaa (1) " })).toEqual({ ok: true, patch: { answer: "Ikhfaa (1)" } });
  });

  it("checks marks and answer lines", () => {
    expect(cleanItemPatch({ marks: 2.5 })).toEqual({ ok: true, patch: { marks: 2.5 } });
    expect(cleanItemPatch({ marks: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/0.5 and 100/) });
    expect(cleanItemPatch({ marks: 1.2 })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ answer_lines: 0 })).toEqual({ ok: true, patch: { answer_lines: 0 } });
    expect(cleanItemPatch({ answer_lines: 31 })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ answer_lines: 1.5 })).toMatchObject({ ok: false });
  });

  it("checks options: at most 10, text at most 500, our pictures only", () => {
    const opt = { text: " Idghaam ", image: null, correct: true };
    expect(cleanItemPatch({ options: [opt, { text: "Iqlaab" }] })).toEqual({
      ok: true,
      patch: { options: [{ text: "Idghaam", image: null, correct: true }, { text: "Iqlaab", image: null, correct: false }] },
    });
    expect(cleanItemPatch({ options: null })).toEqual({ ok: true, patch: { options: null } });
    expect(cleanItemPatch({ options: Array(11).fill(opt) })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ options: [{ ...opt, text: "x".repeat(501) }] })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ options: [{ ...opt, image: "https://evil/x.png" }] })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ options: [{ ...opt, image: "bank/a.png" }] })).toMatchObject({ ok: true });
    expect(cleanItemPatch({ options: [{ ...opt, correct: "yes" }] })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ options: "a,b" })).toMatchObject({ ok: false });
  });

  it("checks a typeset ayah range", () => {
    expect(cleanItemPatch({ prompt_quran: { surah: 103, from_ayah: 1, to_ayah: 3 } }))
      .toEqual({ ok: true, patch: { prompt_quran: { surah: 103, from_ayah: 1, to_ayah: 3 } } });
    expect(cleanItemPatch({ prompt_quran: null })).toEqual({ ok: true, patch: { prompt_quran: null } });
    expect(cleanItemPatch({ prompt_quran: { surah: 115, from_ayah: 1, to_ayah: 1 } })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ prompt_quran: { surah: 2, from_ayah: 5, to_ayah: 4 } })).toMatchObject({ ok: false });
  });

  it("checks pictures and kind", () => {
    expect(cleanItemPatch({ prompt_images: ["bank/a.png", "new/x/b.jpg"] }))
      .toEqual({ ok: true, patch: { prompt_images: ["bank/a.png", "new/x/b.jpg"] } });
    expect(cleanItemPatch({ prompt_images: ["../x.png"] })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ kind: "essay" })).toMatchObject({ ok: false });
    expect(cleanItemPatch({ kind: "mcq", select_many: true })).toEqual({ ok: true, patch: { kind: "mcq", select_many: true } });
    expect(cleanItemPatch({ select_many: "yes" })).toMatchObject({ ok: false });
  });

  it("drops unknown keys and refuses an empty patch", () => {
    expect(cleanItemPatch({ paper_id: ID, bank_question_id: ID })).toEqual({ ok: false, error: "Nothing to change." });
    expect(cleanItemPatch({ marks: 1, paper_id: ID })).toEqual({ ok: true, patch: { marks: 1 } });
  });
});

describe("answerLinesFor", () => {
  it("is none for a multiple choice, else two per mark between 2 and 10", () => {
    expect(answerLinesFor("mcq", 3)).toBe(0);
    expect(answerLinesFor("short", 0.5)).toBe(2);
    expect(answerLinesFor("short", 1)).toBe(2);
    expect(answerLinesFor("short", 1.5)).toBe(3);
    expect(answerLinesFor("short", 3)).toBe(6);
    expect(answerLinesFor("short", 8)).toBe(10);
  });
});

describe("moved and renumbered", () => {
  const rows = [
    { id: "c", position: 3 },
    { id: "a", position: 1 },
    { id: "b", position: 2 },
  ];

  it("swaps with the neighbour, in position order", () => {
    expect(moved(rows, "b", "up")?.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(moved(rows, "b", "down")?.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("is null at either end or for an unknown id", () => {
    expect(moved(rows, "a", "up")).toBeNull();
    expect(moved(rows, "c", "down")).toBeNull();
    expect(moved(rows, "z", "up")).toBeNull();
  });

  it("writes only the positions that are wrong", () => {
    expect(renumbered([{ id: "b", position: 2 }, { id: "a", position: 1 }, { id: "c", position: 3 }]))
      .toEqual([{ id: "b", position: 1 }, { id: "a", position: 2 }]);
    expect(renumbered([{ id: "a", position: 1 }, { id: "c", position: 5 }])).toEqual([{ id: "c", position: 2 }]);
    expect(renumbered([])).toEqual([]);
  });
});
