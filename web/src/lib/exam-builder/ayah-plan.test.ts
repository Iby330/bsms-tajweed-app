import { describe, expect, it } from "vitest";
import { buildAyahPlan, buildProposals, type MappingLine } from "./ayah-plan";

const ROW_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ROW_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ROW_C = "cccccccc-0000-4000-8000-000000000003";

const line = (over: Partial<MappingLine>): MappingLine => ({
  image: "bank/x.png",
  used_by: [{ row_id: ROW_A, where: "prompt" }],
  match: "exact",
  ref: { surah: 104, from_ayah: 1, to_ayah: 1, from_word: null, to_word: null },
  includes_ayah_end: true,
  differs_from_db: "",
  swap: "safe",
  note: "",
  ...over,
});

const lines: MappingLine[] = [
  // Row A: two prompt pictures that make one range (104:1 + 104:2).
  line({ image: "bank/a1.png" }),
  line({ image: "bank/a2.png", ref: { surah: 104, from_ayah: 2, to_ayah: 2, from_word: null, to_word: null } }),
  // Row B: option 2 is a phrase with no ayah marker, found in many places.
  line({
    image: "bank/b2.png",
    used_by: [{ row_id: ROW_B, where: "option 2" }],
    match: "unsure",
    ref: { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 },
    includes_ayah_end: false,
  }),
  // Row B: option 3 ends on the ayah marker, which the picture shows.
  line({
    image: "bank/b3.png",
    used_by: [{ row_id: ROW_B, where: "option 3" }],
    ref: { surah: 54, from_ayah: 3, to_ayah: 3, from_word: 6, to_word: 6 },
    includes_ayah_end: true,
    differs_from_db: "small picture",
  }),
  // Row B: option 4 needs the owner: it is proposed but never planned.
  line({
    image: "bank/b4.png",
    used_by: [{ row_id: ROW_B, where: "option 4" }],
    ref: { surah: 54, from_ayah: 6, to_ayah: 6, from_word: 2, to_word: 3 },
    includes_ayah_end: false,
    swap: "owner_check",
    note: "OWNER CHECK: the typeset words carry a stop sign the picture does not.",
  }),
  // Row C: a circled letter: neither proposed nor planned.
  line({ image: "bank/c.png", used_by: [{ row_id: ROW_C, where: "prompt" }], swap: "needs_emphasis" }),
];

/** 54:3 ends with its marker at word 7. */
const ends = { "54:3": 7 };

describe("buildProposals", () => {
  const { proposals, skipped } = buildProposals(lines, ends);

  it("joins a prompt's pictures into one range", () => {
    expect(proposals[ROW_A].prompt).toEqual({
      images: ["bank/a1.png", "bank/a2.png"], ref: { surah: 104, from_ayah: 1, to_ayah: 2 }, status: "safe", look: [],
    });
  });

  it("keeps an option's word range, reaching the marker only when the picture shows it", () => {
    const opts = proposals[ROW_B].options!;
    expect(opts["bank/b2.png"].ref).toEqual({ surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 });
    expect(opts["bank/b2.png"].number).toBe(2);
    expect(opts["bank/b2.png"].look.join(" ")).toMatch(/more than one place/);
    expect(opts["bank/b3.png"].ref).toEqual({ surah: 54, from_ayah: 3, to_ayah: 3, from_word: 6, to_word: 7 });
    expect(opts["bank/b3.png"].look.join(" ")).toMatch(/small picture/);
  });

  it("offers an owner check and a circled letter without planning them", () => {
    expect(proposals[ROW_B].options!["bank/b4.png"].status).toBe("owner_check");
    expect(proposals[ROW_B].options!["bank/b4.png"].look.join(" ")).toMatch(/^Check before using: the typeset words/);
    expect(proposals[ROW_C].prompt!.status).toBe("emphasis");
    expect(proposals[ROW_C].prompt!.look[0]).toMatch(/circles one letter/);
    expect(skipped).toEqual([]);
  });

  it("leaves out a picture that is not the Qur'an", () => {
    const r = buildProposals([line({ image: "bank/t.png", ref: null, swap: "keep_picture", match: "not_quran" })], {});
    expect(r.proposals).toEqual({});
    expect(r.skipped[0].reason).toMatch(/keep_picture/);
  });
});

describe("buildAyahPlan", () => {
  const { proposals } = buildProposals(lines, ends);
  const rows = [
    {
      id: ROW_A, prompt: "How many madd?", archived: false,
      prompt_images: ["bank/a2.png", "bank/a1.png"],
      prompt_quran: { surah: 104, from_ayah: 1, to_ayah: 1 },
      options: null,
    },
    {
      id: ROW_B, prompt: "Which has idghaam?", archived: true,
      prompt_images: [],
      prompt_quran: null,
      options: [
        { text: "", image: "bank/b1.png", correct: false },
        { text: "", image: "bank/b3.png", correct: true },
        { text: "", image: "bank/b2.png", correct: false },
        { text: "", image: "bank/b4.png", correct: false },
      ],
    },
  ];
  const { plan, revert, skipped, stats } = buildAyahPlan(proposals, rows, "2026-11-24");

  it("sets the prompt ref and the safe options' refs, pictures untouched, archived rows included", () => {
    expect(plan.kind).toBe("forward");
    expect(plan.entries).toHaveLength(2);
    const a = plan.entries.find((e) => e.ops[0].row_id === ROW_A)!;
    expect(a.ops).toEqual([
      expect.objectContaining({ field: "prompt_quran", old: { surah: 104, from_ayah: 1, to_ayah: 1 }, new: { surah: 104, from_ayah: 1, to_ayah: 2 } }),
    ]);
    const b = plan.entries.find((e) => e.ops[0].row_id === ROW_B)!;
    expect(b.ops).toHaveLength(1);
    expect(b.ops[0].field).toBe("options");
    const next = b.ops[0].new as { image: string; quran?: unknown }[];
    // Found by picture, not by the mapping's option number (the options moved).
    expect(next[1]).toEqual({ text: "", image: "bank/b3.png", correct: true, quran: { surah: 54, from_ayah: 3, to_ayah: 3, from_word: 6, to_word: 7 } });
    expect(next[2].quran).toEqual({ surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 });
    expect(next[0]).not.toHaveProperty("quran");
    expect(next[3]).not.toHaveProperty("quran"); // owner check: not planned
    expect(next.map((o) => o.image)).toEqual(["bank/b1.png", "bank/b3.png", "bank/b2.png", "bank/b4.png"]);
    expect(stats.movedOptions).toBe(2);
    expect(skipped).toEqual([]);
  });

  it("writes a revert plan that swaps old and new, last entry first", () => {
    expect(revert.kind).toBe("revert");
    expect(revert.entries.map((e) => e.entry_id)).toEqual([...plan.entries].reverse().map((e) => e.entry_id));
    const op = revert.entries[revert.entries.length - 1].ops[0];
    const fwd = plan.entries[0].ops[0];
    expect(op.old).toEqual(fwd.new);
    expect(op.new).toEqual(fwd.old);
  });

  it("clears the ref a non-safe slot already carries, so its picture keeps showing", () => {
    const r = buildAyahPlan(proposals, [
      { id: ROW_C, prompt: "Which letter is circled?", archived: false, prompt_images: ["bank/c.png"], prompt_quran: { surah: 104, from_ayah: 1, to_ayah: 1 }, options: null },
    ], "2026-11-24");
    expect(r.plan.entries).toHaveLength(1);
    expect(r.plan.entries[0].ops[0]).toEqual(expect.objectContaining({ field: "prompt_quran", old: { surah: 104, from_ayah: 1, to_ayah: 1 }, new: null }));
    expect(r.stats.keptPictures).toBe(1);
  });

  it("writes nothing for a slot already set, and skips a slot whose picture has gone", () => {
    const done = buildAyahPlan(proposals, [
      { ...rows[0], prompt_quran: { surah: 104, from_ayah: 1, to_ayah: 2, from_word: null } },
      { ...rows[1], options: [{ text: "x", image: null, correct: false }] },
    ], "2026-11-24");
    expect(done.plan.entries).toEqual([]);
    expect(done.skipped.map((s) => s.row_id)).toEqual([ROW_B, ROW_B]);
    expect(done.skipped[0].reason).toMatch(/no option has the picture/);
  });
});

describe("the owner's decisions", () => {
  const ROW_T = "dddddddd-0000-4000-8000-000000000004";
  const ROW_U = "eeeeeeee-0000-4000-8000-000000000005";
  const decided: MappingLine[] = [
    line({ image: "bank/c.png", used_by: [{ row_id: ROW_C, where: "prompt" }], swap: "needs_emphasis", ref: { surah: 1, from_ayah: 3, to_ayah: 3, from_word: null, to_word: null } }),
    line({ image: "bank/k.png", used_by: [{ row_id: ROW_A, where: "prompt" }], swap: "owner_check", ref: { surah: 109, from_ayah: 1, to_ayah: 6, from_word: null, to_word: null } }),
    line({ image: "bank/t.png", used_by: [{ row_id: ROW_T, where: "prompt" }], swap: "keep_picture", match: "not_quran", ref: null }),
    line({ image: "bank/u.png", used_by: [{ row_id: ROW_U, where: "prompt" }], swap: "keep_picture", match: "not_quran", ref: null }),
  ];
  const decisions = {
    "bank/c.png": { safe: true as const, circle: { word: 1, x: 0.3, w: 0.2 }, why: "circle the ر" },
    "bank/k.png": { safe: true as const, basmala: true as const, why: "with the basmala" },
    "bank/t.png": { term: "هاء التنبيه", prompt: "What does هاء التنبيه mean?", promptWas: "What does mean?", why: "type the term" },
    "bank/u.png": { term: "ياء النداء", why: "type the term" },
  };
  const { proposals } = buildProposals(decided, {}, decisions);

  it("plans a circled letter and a surah with its basmala, the reasons kept to look at", () => {
    expect(proposals[ROW_C].prompt).toMatchObject({ status: "safe", ref: { surah: 1, from_ayah: 3, to_ayah: 3, circle: { word: 1, x: 0.3, w: 0.2 } } });
    expect(proposals[ROW_C].prompt!.look.join(" ")).toMatch(/Owner's decision: circle the ر/);
    expect(proposals[ROW_A].prompt).toMatchObject({ status: "safe", ref: { surah: 109, from_ayah: 1, to_ayah: 6, basmala: true } });
  });

  it("types a slide title's term into the question and stops showing its picture", () => {
    const { plan, revert, stats } = buildAyahPlan(proposals, [
      { id: ROW_T, prompt: "What does mean?", archived: false, prompt_images: ["bank/t.png"], prompt_quran: null, options: null },
      { id: ROW_U, prompt: "What does ياء النداء mean?", archived: false, prompt_images: ["bank/u.png"], prompt_quran: null, options: null },
    ], "2026-11-24");
    const t = plan.entries.find((e) => e.ops[0].row_id === ROW_T)!.ops;
    expect(t.map((o) => [o.field, o.new])).toEqual([["prompt", "What does هاء التنبيه mean?"], ["prompt_images", []]]);
    const u = plan.entries.find((e) => e.ops[0].row_id === ROW_U)!.ops;
    expect(u.map((o) => [o.field, o.old, o.new])).toEqual([["prompt_images", ["bank/u.png"], []]]);
    expect(stats.terms).toBe(2);
    // The revert plan puts the picture back.
    const back = revert.entries.flatMap((e) => e.ops).find((o) => o.row_id === ROW_U)!;
    expect(back.new).toEqual(["bank/u.png"]);
  });

  it("gives a paper's copy the same changes only where its picture is still the bank's", () => {
    const ITEM_1 = "11111111-0000-4000-8000-000000000001";
    const ITEM_2 = "22222222-0000-4000-8000-000000000002";
    const ITEM_3 = "33333333-0000-4000-8000-000000000003";
    const { plan, skipped } = buildAyahPlan(proposals, [
      { id: ITEM_1, bank_question_id: ROW_C, prompt: "Circled?", archived: false, prompt_images: ["bank/c.png"], prompt_quran: null, options: null },
      { id: ITEM_2, bank_question_id: ROW_C, prompt: "Circled?", archived: false, prompt_images: ["new/teacher/mine.png"], prompt_quran: null, options: null },
      { id: ITEM_3, bank_question_id: ROW_T, prompt: "Explain this term", archived: false, prompt_images: ["bank/t.png"], prompt_quran: null, options: null },
      { id: "44444444-0000-4000-8000-000000000004", bank_question_id: null, prompt: "Written on the paper", archived: false, prompt_images: [], prompt_quran: null, options: null },
    ], "2026-11-24", "x", "exam_paper_items", "change-plan-ayahs-papers.json");
    expect(plan.table).toBe("exam_paper_items");
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].entry_id).toBe("P001");
    expect(plan.entries[0].ops[0]).toMatchObject({ row_id: ITEM_1, field: "prompt_quran", new: { surah: 1, from_ayah: 3, to_ayah: 3, circle: { word: 1, x: 0.3, w: 0.2 } } });
    expect(skipped.map((s) => s.row_id)).toEqual([ITEM_2, ITEM_3]);
    expect(skipped[0].reason).toMatch(/copy was edited/);
  });
});
