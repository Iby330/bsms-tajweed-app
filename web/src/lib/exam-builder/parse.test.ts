import { describe, expect, it } from "vitest";
import {
  parseKind, parseOptions, parsePaperStatus, parsePractical, parseQuranRef, parseReviewStatus, parseSectionKind,
  parseSources, toBankQuestion, toPaper, toPaperItem, toSection, type BankRow, type ItemRow, type PaperRow,
  type SectionRow,
} from "./parse";

describe("parseOptions", () => {
  it("reads a well-formed list", () => {
    expect(parseOptions([{ text: "Ikhfaa", image: null, correct: true }, { text: "Idghaam", image: "bank/a.png", correct: false }]))
      .toEqual([{ text: "Ikhfaa", image: null, correct: true }, { text: "Idghaam", image: "bank/a.png", correct: false }]);
  });

  it("fills a missing image or correct, and a picture-only option's text", () => {
    expect(parseOptions([{ text: "A" }, { image: "bank/b.png", correct: true }]))
      .toEqual([{ text: "A", image: null, correct: false }, { text: "", image: "bank/b.png", correct: true }]);
  });

  it("is null for anything malformed", () => {
    expect(parseOptions(null)).toBeNull();
    expect(parseOptions({ text: "A" })).toBeNull();
    expect(parseOptions("A, B")).toBeNull();
    expect(parseOptions([{ text: "A" }, "B"])).toBeNull();
    expect(parseOptions([{ text: 5 }])).toBeNull();
    expect(parseOptions([{}])).toBeNull();
    expect(parseOptions([{ text: "A", image: 3 }])).toBeNull();
    expect(parseOptions([{ text: "A", correct: "yes" }])).toBeNull();
  });

  it("keeps an empty list as empty", () => {
    expect(parseOptions([])).toEqual([]);
  });
});

describe("parseQuranRef", () => {
  it("reads a range, with optional words", () => {
    expect(parseQuranRef({ surah: 103, from_ayah: 1, to_ayah: 3 })).toEqual({ surah: 103, from_ayah: 1, to_ayah: 3 });
    expect(parseQuranRef({ surah: 2, from_ayah: 5, to_ayah: 5, from_word: 2, to_word: 4 }))
      .toEqual({ surah: 2, from_ayah: 5, to_ayah: 5, from_word: 2, to_word: 4 });
    expect(parseQuranRef({ surah: 2, from_ayah: 5, to_ayah: 5, from_word: null })).toEqual({ surah: 2, from_ayah: 5, to_ayah: 5 });
  });

  it("is null for a bad surah, a backwards range or junk", () => {
    expect(parseQuranRef({ surah: 0, from_ayah: 1, to_ayah: 1 })).toBeNull();
    expect(parseQuranRef({ surah: 115, from_ayah: 1, to_ayah: 1 })).toBeNull();
    expect(parseQuranRef({ surah: 2, from_ayah: 4, to_ayah: 3 })).toBeNull();
    expect(parseQuranRef({ surah: "2", from_ayah: 1, to_ayah: 1 })).toBeNull();
    expect(parseQuranRef({ surah: 2, from_ayah: 1.5, to_ayah: 2 })).toBeNull();
    expect(parseQuranRef({ surah: 2, from_ayah: 1, to_ayah: 2, from_word: 0 })).toBeNull();
    expect(parseQuranRef(null)).toBeNull();
    expect(parseQuranRef([103, 1, 3])).toBeNull();
  });
});

describe("parseSources", () => {
  it("keeps good entries and drops bad ones", () => {
    expect(parseSources([
      { label: "EOT2 25/26", kind: "exam", number: "A12" },
      { label: "Term 2 question bank 25/26", kind: "bank" },
      { label: "", kind: "exam" },
      { label: "X", kind: "rumour" },
      "EOT1",
    ])).toEqual([
      { label: "EOT2 25/26", kind: "exam", number: "A12" },
      { label: "Term 2 question bank 25/26", kind: "bank" },
    ]);
  });

  it("is [] for anything that is not a list", () => {
    expect(parseSources(null)).toEqual([]);
    expect(parseSources({ label: "EOT2 25/26", kind: "exam" })).toEqual([]);
    expect(parseSources("EOT2")).toEqual([]);
  });
});

describe("parsePractical", () => {
  it("reads the table or gives null", () => {
    expect(parsePractical({ rows: 3, marks: 9, columns: ["Verse", "Surah"] })).toEqual({ rows: 3, marks: 9, columns: ["Verse", "Surah"] });
    expect(parsePractical({ rows: 3, marks: 9 })).toBeNull();
    expect(parsePractical({ rows: -1, marks: 9, columns: [] })).toBeNull();
    expect(parsePractical({ rows: 3, marks: "9", columns: [] })).toBeNull();
    expect(parsePractical(null)).toBeNull();
  });
});

describe("the enum columns", () => {
  it("fall back to the safe value", () => {
    expect(parseKind("mcq")).toBe("mcq");
    expect(parseKind("essay")).toBe("short");
    expect(parseReviewStatus("check")).toBe("check");
    expect(parseReviewStatus("approved")).toBe("approved");
    expect(parseReviewStatus("?")).toBe("clean");
    expect(parsePaperStatus("final")).toBe("final");
    expect(parsePaperStatus("x")).toBe("draft");
    expect(parseSectionKind("practical")).toBe("practical");
    expect(parseSectionKind("x")).toBe("questions");
  });
});

describe("row mappers", () => {
  it("toBankQuestion narrows every jsonb column and attaches the URLs", () => {
    const row: BankRow = {
      id: "q1", topic_id: "sifaat.ra", kind: "mcq", prompt: "Which?", prompt_images: ["bank/a.png"],
      prompt_quran: { surah: 0 }, options: "broken", select_many: false, answer: null, marks: 1,
      sources: { label: "x" }, used_in: ["EOT2 25/26"], review_status: "weird", review_note: null,
      archived: false, import_key: "G1-001", created_by: null, created_at: "2026-11-19T00:00:00Z",
    };
    const q = toBankQuestion(row, { "bank/a.png": "https://signed" });
    expect(q).toMatchObject({
      kind: "mcq", options: null, prompt_quran: null, sources: [], review_status: "clean",
      used_in: ["EOT2 25/26"], imageUrls: { "bank/a.png": "https://signed" },
    });
    expect(toBankQuestion(row).imageUrls).toEqual({});
  });

  it("toSection keeps a table only on a practical section", () => {
    const base: SectionRow = { id: "s", paper_id: "p", position: 1, title: "C", kind: "practical", practical: { rows: 3, marks: 9, columns: ["Verse"] } };
    expect(toSection(base).practical).toEqual({ rows: 3, marks: 9, columns: ["Verse"] });
    expect(toSection({ ...base, kind: "questions" }).practical).toBeNull();
    expect(toSection({ ...base, practical: "x" }).practical).toBeNull();
  });

  it("toPaper and toPaperItem narrow status, kind, options and the ayah", () => {
    const paper: PaperRow = {
      id: "p", owner_id: "o", title: "T", name: "", date_label: "", duration_label: "", code: "EOT1", season: "26/27",
      notes: ["a"], status: "final", shared: false, published_at: null, updated_by: null, finalised_at: null, created_at: "", updated_at: "",
    };
    expect(toPaper(paper).status).toBe("final");
    expect(toPaper({ ...paper, status: "?" }).status).toBe("draft");

    const item: ItemRow = {
      id: "i", paper_id: "p", section_id: "s", position: 1, bank_question_id: null, kind: "short", prompt: "Q",
      prompt_images: [], prompt_quran: { surah: 1, from_ayah: 1, to_ayah: 7 }, options: [{ text: "x" }],
      select_many: false, answer: null, marks: 2, answer_lines: 4,
    };
    expect(toPaperItem(item)).toMatchObject({
      kind: "short", prompt_quran: { surah: 1, from_ayah: 1, to_ayah: 7 }, options: [{ text: "x", image: null, correct: false }],
    });
  });
});
