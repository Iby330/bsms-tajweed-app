import { describe, it, expect } from "vitest";
import { huntScore, huntTally, huntWords, isRuleHunt, parseHunt } from "./rule-hunt";

/** Two letters of a word and one of the next, each offering three rules. */
const RULES = ["lam_shamsi", "hams", "qalqalah"] as const;
const KEY: Record<string, { correct?: boolean; inst?: string }> = {
  // One lām: found on either letter, and only once.
  "1:1:1:lam_shamsi": { correct: true, inst: "lam-1" },
  "1:1:2:lam_shamsi": { correct: true, inst: "lam-1" },
  // Accepted but not asked for.
  "1:1:2:hams": { correct: true },
  "1:2:1:qalqalah": { correct: true, inst: "q-1" },
};
const options = ["1:1:1", "1:1:2", "1:2:1"].flatMap((loc, l) =>
  RULES.map((rule, r) => ({
    position: l * RULES.length + r,
    label: `H:91:${loc}:${rule}`,
    value: `letter ${loc}`,
    ...KEY[`${loc}:${rule}`],
  })),
);
const at = (loc: string, rule: string) => options.find((o) => o.label === `H:91:${loc}:${rule}`)!.position;

describe("rule hunt shape", () => {
  it("reads its own labels and refuses anyone else's", () => {
    expect(parseHunt("H:91:3:1:4:hams")).toEqual({ surah: 91, ayah: 3, word: 1, letter: 4, rule: "hams" });
    expect(parseHunt("H:91:3:1:4:madd")).toBeNull();
    expect(isRuleHunt(options)).toBe(true);
    expect(isRuleHunt([{ label: "L:91:1:1:1" }])).toBe(false);
    expect(isRuleHunt([])).toBe(false);
    expect(isRuleHunt(null)).toBe(false);
  });

  it("gathers a letter's rules and ends the ayah on its last word", () => {
    const words = huntWords(options);
    expect(words.map((w) => w.letters.length)).toEqual([2, 1]);
    expect(Object.keys(words[0].letters[0].options)).toEqual([...RULES]);
    expect(words.map((w) => w.endsAyah)).toEqual([false, true]);
  });
});

describe("rule hunt marking", () => {
  it("counts a thing found on any of its letters once", () => {
    const both = [at("1:1:1", "lam_shamsi"), at("1:1:2", "lam_shamsi")];
    expect(huntTally(options, both).found).toBe(1);
    expect(huntScore(options, both, 2)).toBe(1);
  });

  it("neither rewards nor punishes an accepted tag", () => {
    const t = huntTally(options, [at("1:1:2", "hams")]);
    expect([t.found, t.wrong]).toEqual([0, 0]);
    expect(huntScore(options, [at("1:1:2", "hams")], 2)).toBe(0);
  });

  it("lets a wrong tag cancel a found one, never below zero", () => {
    const found = [at("1:1:1", "lam_shamsi"), at("1:2:1", "qalqalah")];
    expect(huntScore(options, found, 2)).toBe(2);
    expect(huntScore(options, [...found, at("1:1:1", "hams")], 2)).toBe(1);
    expect(huntScore(options, [at("1:1:1", "hams"), at("1:2:1", "hams")], 2)).toBe(0);
  });

  it("lists every letter of what was missed, and none of what was found", () => {
    const { missed } = huntTally(options, [at("1:2:1", "qalqalah")]);
    expect([...missed].sort()).toEqual([at("1:1:1", "lam_shamsi"), at("1:1:2", "lam_shamsi")].sort());
  });

  it("tallies rule by rule", () => {
    const { rules } = huntTally(options, [at("1:1:1", "lam_shamsi"), at("1:1:1", "qalqalah")]);
    expect(rules.find((r) => r.id === "lam_shamsi")).toMatchObject({ found: 1, total: 1, wrong: 0 });
    expect(rules.find((r) => r.id === "qalqalah")).toMatchObject({ found: 0, total: 1, wrong: 1 });
  });

  it("does not guess with no key", () => {
    const blank = options.map(({ position, label, value }) => ({ position, label, value }));
    expect(huntScore(blank, [0], 2)).toBeNull();
  });
});
