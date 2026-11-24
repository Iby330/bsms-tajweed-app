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
