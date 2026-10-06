import { describe, it, expect } from "vitest";
import { isLetterGrid, blocksOf, questionLabels, partLetter } from "./letters";

const ALPHABET = ["ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي","ء"];
const grid = ALPHABET.map((l, i) => ({ position: i, label: `Option ${i + 1}`, value: l }));
const PROMPT = "Which letter is being pronounced? Press play, listen, then tap the letter you hear.";

const text = (prompt: string) => ({ qtype: "text", prompt, options: null });
const letter = (prompt = PROMPT) => ({ qtype: "mcq", prompt, options: grid });
const mcq = (prompt: string) => ({
  qtype: "mcq", prompt,
  options: [{ label: "A", value: "Zayd ibn Thābit" }, { label: "B", value: "Abū Lahab" }],
});

describe("isLetterGrid", () => {
  it("is the whole alphabet with hamzah", () => {
    expect(isLetterGrid(grid)).toBe(true);
  });

  it("reads the label when there is no value", () => {
    expect(isLetterGrid(ALPHABET.map((l) => ({ label: l })))).toBe(true);
  });

  it("forgives stray spaces around a letter", () => {
    expect(isLetterGrid(ALPHABET.map((l) => ({ label: "x", value: ` ${l} ` })))).toBe(true);
  });

  it("is not a short list of letters, which reads better as a list", () => {
    expect(isLetterGrid(grid.slice(0, 4))).toBe(false);
  });

  it("is not options holding words, or a letter with a ḥarakah", () => {
    expect(isLetterGrid([...grid.slice(0, 12), { label: "x", value: "بَ" }])).toBe(false);
    expect(isLetterGrid([...grid.slice(0, 12), { label: "x", value: "نون" }])).toBe(false);
  });

  it("is not no options", () => {
    expect(isLetterGrid(null)).toBe(false);
    expect(isLetterGrid(undefined)).toBe(false);
  });
});

describe("blocksOf and questionLabels", () => {
  it("folds a run of letter questions into one stepped question", () => {
    const qs = [text("What is the Qur'an?"), mcq("Which companion?"), letter(), letter(), letter(), text("After")];
    const blocks = blocksOf(qs);
    expect(blocks.map((b) => b.kind)).toEqual(["one", "one", "steps", "one"]);
    expect(blocks[2]).toMatchObject({ kind: "steps", indexes: [2, 3, 4], number: 3 });
    expect(questionLabels(qs)).toEqual(["1", "2", "3a", "3b", "3c", "4"]);
  });

  it("is the Qāʿidah homework 1 shape: six questions then 7a to 7j", () => {
    const qs = [...Array.from({ length: 6 }, (_, i) => text(`Q${i}`)), ...Array.from({ length: 10 }, () => letter())];
    expect(questionLabels(qs)).toEqual(["1", "2", "3", "4", "5", "6", "7a", "7b", "7c", "7d", "7e", "7f", "7g", "7h", "7i", "7j"]);
  });

  it("leaves a lone letter question as an ordinary question", () => {
    expect(questionLabels([text("a"), letter(), text("b")])).toEqual(["1", "2", "3"]);
  });

  it("splits runs whose prompts differ", () => {
    expect(questionLabels([letter("Listen to the first"), letter("Listen to the second")])).toEqual(["1", "2"]);
    expect(questionLabels([letter("P"), letter("P"), letter("Q"), letter("Q")])).toEqual(["1a", "1b", "2a", "2b"]);
  });

  it("does not fold a checkbox, even over the alphabet", () => {
    const tick = { qtype: "checkbox", prompt: PROMPT, options: grid };
    expect(questionLabels([tick, tick])).toEqual(["1", "2"]);
  });

  it("numbers an empty paper as nothing", () => {
    expect(questionLabels([])).toEqual([]);
  });
});

describe("partLetter", () => {
  it("runs a to z, then numbers", () => {
    expect(partLetter(0)).toBe("a");
    expect(partLetter(9)).toBe("j");
    expect(partLetter(25)).toBe("z");
    expect(partLetter(26)).toBe("27");
  });
});
