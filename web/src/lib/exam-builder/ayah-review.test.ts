import { describe, expect, it } from "vitest";
import type { Proposals } from "./ayah-plan";
import { ayahEntries, filterEntries, slotChoice } from "./ayah-review";
import type { BankQuestion } from "./types";

const q = (over: Partial<BankQuestion>): BankQuestion => ({
  id: "q", topic_id: "t", kind: "mcq", prompt: "Q", prompt_images: [], prompt_quran: null, options: null,
  select_many: false, answer: null, marks: 1, sources: [], used_in: [], review_status: "clean", review_note: null,
  archived: false, import_key: null, created_by: null, created_at: "", imageUrls: {}, ...over,
});
const ref = { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 };
const proposals: Proposals = {
  a: { prompt: { images: ["bank/p.png"], ref: { surah: 1, from_ayah: 3, to_ayah: 3 }, status: "safe", look: [] } },
  b: { options: { "bank/o.png": { images: ["bank/o.png"], ref, status: "safe", look: ["These words are found in more than one place"], number: 1 } } },
  c: { term: { images: ["bank/t.png"], term: "ياء النداء", prompt: null, prompt_was: null, look: ["Not the Qur'an"] } },
};

describe("ayahEntries", () => {
  const entries = ayahEntries([
    q({ id: "a", prompt_images: ["bank/p.png"], prompt_quran: { surah: 1, from_ayah: 3, to_ayah: 3 } }),
    q({ id: "b", options: [{ text: "", image: "bank/o.png", correct: false }, { text: "x", image: null, correct: true }] }),
    q({ id: "c", prompt: "What does ياء النداء mean?", prompt_images: [] }),
    q({ id: "d", prompt_images: ["bank/plain.png"] }), // a picture, no ref, no proposal: not shown
  ], proposals);

  it("shows each question with a picture and a ref or a proposal, slot by slot", () => {
    expect(entries.map((e) => e.question.id)).toEqual(["a", "b", "c"]);
    expect(entries[0].slots[0]).toMatchObject({ key: "prompt", typeset: true, images: ["bank/p.png"] });
    // Option 1's ref was cleared ("Keep the picture"): the proposal can put it back.
    expect(entries[1].slots[0]).toMatchObject({ key: "option:bank/o.png", label: "Option 1", typeset: false, ref: null, proposed: ref });
    // The slide title is off the question: its typed term shows, the picture is kept in the proposals.
    expect(entries[2].slots[0]).toMatchObject({ key: "term", typeset: true, images: ["bank/t.png"], term: "ياء النداء" });
  });

  it("filters to the ones that need a look, or kept as pictures", () => {
    expect(filterEntries(entries, "look").map((e) => e.question.id)).toEqual(["b", "c"]);
    expect(filterEntries(entries, "kept").map((e) => e.question.id)).toEqual(["b"]);
    expect(filterEntries(entries, "all")).toHaveLength(3);
  });
});

describe("slotChoice", () => {
  it("clears and restores a prompt's ref, never leaving a question with neither", () => {
    const row = { prompt_images: ["bank/p.png"], prompt_quran: { surah: 1, from_ayah: 3, to_ayah: 3 }, options: null };
    expect(slotChoice(row, "prompt", false, proposals, "a")).toEqual({ ok: true, update: { prompt_quran: null } });
    expect(slotChoice({ ...row, prompt_quran: null }, "prompt", true, proposals, "a")).toEqual({ ok: true, update: { prompt_quran: { surah: 1, from_ayah: 3, to_ayah: 3 } } });
    expect(slotChoice({ ...row, prompt_images: [] }, "prompt", false, proposals, "a")).toMatchObject({ ok: false });
  });

  it("toggles one option's ref by its picture, the rest of the option kept", () => {
    const row = { prompt_images: [], prompt_quran: null, options: [{ text: "", image: "bank/o.png", correct: true }, { text: "x", image: null, correct: false }] };
    const on = slotChoice(row, "option:bank/o.png", true, proposals, "b");
    expect(on).toEqual({ ok: true, update: { options: [{ text: "", image: "bank/o.png", correct: true, quran: ref }, { text: "x", image: null, correct: false }] } });
    const off = slotChoice({ ...row, options: (on as { update: { options: unknown } }).update.options }, "option:bank/o.png", false, proposals, "b");
    expect(off).toEqual({ ok: true, update: { options: row.options } });
  });

  it("puts a slide title's picture back, and takes it off again", () => {
    const row = { prompt_images: [], prompt_quran: null, options: null };
    expect(slotChoice(row, "term", false, proposals, "c")).toEqual({ ok: true, update: { prompt_images: ["bank/t.png"] } });
    expect(slotChoice({ ...row, prompt_images: ["bank/t.png"] }, "term", true, proposals, "c")).toEqual({ ok: true, update: { prompt_images: [] } });
  });
});
