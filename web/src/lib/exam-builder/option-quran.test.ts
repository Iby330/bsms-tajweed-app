import { describe, expect, it } from "vitest";
import { cleanBankPatch, mcqProblem } from "./bank-validate";
import { cleanNewQuestion } from "./new-question-validate";
import { parseOptions, parseQuranRef, toBankQuestion, toPaperItem, type BankRow, type ItemRow } from "./parse";
import { cleanItemPatch } from "./validate";

/** An option's own Qur'an ref: kept everywhere options pass through. */
const ref = { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 };
const stored = [
  { text: "", image: "bank/a.png", correct: false, quran: ref },
  { text: "Neither", image: null, correct: true },
];

describe("an option's quran ref", () => {
  it("is read from the row, and an option without one stays as it was", () => {
    expect(parseOptions(stored)).toEqual([
      { text: "", image: "bank/a.png", correct: false, quran: ref },
      { text: "Neither", image: null, correct: true },
    ]);
  });

  it("drops a malformed ref but keeps the option and its picture", () => {
    const out = parseOptions([{ text: "", image: "bank/a.png", correct: false, quran: { surah: 200, from_ayah: 1, to_ayah: 1 } }]);
    expect(out).toEqual([{ text: "", image: "bank/a.png", correct: false }]);
    expect(parseOptions([{ text: "x", image: null, correct: false, quran: null }])).toEqual([{ text: "x", image: null, correct: false }]);
  });

  it("survives loading a bank row and a paper item", () => {
    expect(toBankQuestion({ options: stored, prompt_images: [], sources: [], used_in: [] } as unknown as BankRow).options?.[0].quran).toEqual(ref);
    expect(toPaperItem({ options: stored, prompt_images: [] } as unknown as ItemRow).options?.[0].quran).toEqual(ref);
  });

  it("round-trips through an item edit, a bank edit and a new question", () => {
    const item = cleanItemPatch({ options: parseOptions(stored) });
    expect(item).toEqual({ ok: true, patch: { options: parseOptions(stored) } });

    const bank = cleanBankPatch({ options: parseOptions(stored) });
    expect(bank.ok && bank.patch.options?.[0].quran).toEqual(ref);

    const fresh = cleanNewQuestion({
      topic_id: "noon.iqlaab", kind: "mcq", prompt: "Which has iqlaab?", marks: 1,
      options: [{ text: "", image: null, correct: true, quran: ref }, { text: "None", image: null, correct: false }],
    });
    expect(fresh.ok && fresh.value.options?.[0]).toEqual({ text: "", image: null, correct: true, quran: ref });
  });

  it("refuses a malformed ref on a write, and lets null clear it", () => {
    expect(cleanItemPatch({ options: [{ text: "x", image: null, correct: false, quran: { surah: 0 } }] })).toMatchObject({
      ok: false, error: expect.stringMatching(/ayah/i),
    });
    expect(cleanItemPatch({ options: [{ text: "x", image: null, correct: false, quran: null }] })).toEqual({
      ok: true, patch: { options: [{ text: "x", image: null, correct: false }] },
    });
  });

  it("counts as something in the option, like a picture", () => {
    expect(mcqProblem("mcq", [{ text: "", image: null, correct: false, quran: ref }, { text: "B", image: null, correct: true }])).toBeNull();
  });
});

describe("a ref's basmala and circle", () => {
  it("are kept through parsing and an edit, and dropped when malformed", () => {
    const full = { surah: 1, from_ayah: 3, to_ayah: 3, circle: { word: 1, x: 0.4, w: 0.2 } };
    expect(parseQuranRef(full)).toEqual(full);
    expect(parseQuranRef({ surah: 109, from_ayah: 1, to_ayah: 6, basmala: true })).toEqual({ surah: 109, from_ayah: 1, to_ayah: 6, basmala: true });
    expect(parseQuranRef({ surah: 109, from_ayah: 1, to_ayah: 6, basmala: "yes", circle: { word: 1, x: 3, w: 0.2 } })).toEqual({ surah: 109, from_ayah: 1, to_ayah: 6 });
    expect(cleanItemPatch({ prompt_quran: { surah: 109, from_ayah: 1, to_ayah: 6, basmala: true } })).toEqual({
      ok: true, patch: { prompt_quran: { surah: 109, from_ayah: 1, to_ayah: 6, basmala: true } },
    });
    const opt = cleanItemPatch({ options: [{ text: "", image: null, correct: false, quran: full }] });
    expect(opt.ok && opt.patch.options?.[0].quran).toEqual(full);
  });
});
