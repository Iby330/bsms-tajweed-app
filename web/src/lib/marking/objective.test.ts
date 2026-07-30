import { describe, expect, it } from "vitest";
import {
  parseAutoRubric,
  parseOptions,
  parseResponse,
  parseRubric,
  scoreObjective,
  type AnswerResponse,
  type MarkableQuestion,
} from "./objective";

// ─── helpers ────────────────────────────────────────────────────────────────

function opts(correct: number[], total: number) {
  return Array.from({ length: total }, (_, i) => ({
    position: i,
    label: `Option ${i}`,
    value: `Value ${i}`,
    correct: correct.includes(i),
  }));
}

function mcq(correct: number[], points = 1, total = 4): MarkableQuestion {
  return { qtype: "mcq", scoring: "exact", points, options: opts(correct, total) };
}

function checkboxExact(correct: number[], points = 2, total = 4): MarkableQuestion {
  return { qtype: "checkbox", scoring: "exact", points, options: opts(correct, total) };
}

function checkboxPerOption(correct: number[], points: number, total = 6): MarkableQuestion {
  return { qtype: "checkbox", scoring: "per_option", points, options: opts(correct, total) };
}

const sel = (positions: number[]): AnswerResponse => ({ selected: positions });

// ─── table-driven cases ─────────────────────────────────────────────────────

type Case = {
  name: string;
  question: MarkableQuestion;
  response: AnswerResponse;
  expected: number | null;
};

const cases: Case[] = [
  // mcq / exact
  { name: "mcq: correct pick → full points", question: mcq([1], 2), response: sel([1]), expected: 2 },
  { name: "mcq: wrong pick → 0", question: mcq([1]), response: sel([3]), expected: 0 },
  { name: "mcq: empty selection → 0", question: mcq([1]), response: sel([]), expected: 0 },
  { name: "mcq: missing selected key → 0", question: mcq([1]), response: {}, expected: 0 },
  { name: "mcq: text response instead of selection → 0", question: mcq([1]), response: { text: "hello" }, expected: 0 },
  { name: "mcq: correct + extra pick → 0 (set mismatch)", question: mcq([1]), response: sel([1, 2]), expected: 0 },
  { name: "mcq: no answer key → null (manual queue)", question: mcq([], 2), response: sel([0]), expected: null },
  {
    name: "mcq: bonus question scores normally",
    question: { ...mcq([2], 3), is_bonus: true },
    response: sel([2]),
    expected: 3,
  },
  {
    name: "mcq: bonus question wrong pick → 0",
    question: { ...mcq([2], 3), is_bonus: true },
    response: sel([0]),
    expected: 0,
  },
  { name: "mcq: fractional points pass through", question: mcq([0], 0.5), response: sel([0]), expected: 0.5 },

  // checkbox / exact
  { name: "checkbox exact: exact set → full points", question: checkboxExact([0, 2], 2), response: sel([0, 2]), expected: 2 },
  { name: "checkbox exact: order-insensitive", question: checkboxExact([0, 2], 2), response: sel([2, 0]), expected: 2 },
  { name: "checkbox exact: duplicate picks deduped", question: checkboxExact([0, 2], 2), response: sel([0, 0, 2]), expected: 2 },
  { name: "checkbox exact: subset → 0", question: checkboxExact([0, 2], 2), response: sel([0]), expected: 0 },
  { name: "checkbox exact: superset → 0", question: checkboxExact([0, 2], 2), response: sel([0, 2, 3]), expected: 0 },
  { name: "checkbox exact: disjoint → 0", question: checkboxExact([0, 2], 2), response: sel([1, 3]), expected: 0 },
  { name: "checkbox exact: empty → 0", question: checkboxExact([0, 2], 2), response: sel([]), expected: 0 },
  { name: "checkbox exact: no answer key → null", question: checkboxExact([], 2), response: sel([1]), expected: null },

  // checkbox / per_option — points × max(0, |sel∩correct| − |sel∖correct|)/|correct|
  { name: "per_option: all correct → full points", question: checkboxPerOption([0, 1, 2, 3], 4), response: sel([0, 1, 2, 3]), expected: 4 },
  { name: "per_option: 3 of 4, no wrong → 3", question: checkboxPerOption([0, 1, 2, 3], 4), response: sel([0, 1, 2]), expected: 3 },
  { name: "per_option: 3 correct + 1 wrong → 2 (cancellation)", question: checkboxPerOption([0, 1, 2, 3], 4), response: sel([0, 1, 2, 4]), expected: 2 },
  { name: "per_option: 2 correct + 2 wrong → 0", question: checkboxPerOption([0, 1, 2, 3], 4), response: sel([0, 1, 4, 5]), expected: 0 },
  { name: "per_option: 1 correct + 3 wrong floors at 0", question: checkboxPerOption([0, 1, 2], 3, 8), response: sel([0, 5, 6, 7]), expected: 0 },
  { name: "per_option: wrong-only picks → 0", question: checkboxPerOption([0, 1], 2), response: sel([2, 3]), expected: 0 },
  { name: "per_option: empty selection → 0", question: checkboxPerOption([0, 1], 2), response: sel([]), expected: 0 },
  { name: "per_option: rounds to 2dp (5 × 2/3 = 3.33)", question: checkboxPerOption([0, 1, 2], 5), response: sel([0, 1]), expected: 3.33 },
  { name: "per_option: duplicates deduped before scoring", question: checkboxPerOption([0, 1], 2), response: sel([0, 0, 1, 1]), expected: 2 },
  { name: "per_option: no answer key → null", question: checkboxPerOption([], 4), response: sel([0]), expected: null },
  {
    name: "per_option: bonus scores normally",
    question: { ...checkboxPerOption([0, 1], 2), is_bonus: true },
    response: sel([0, 1]),
    expected: 2,
  },

  // free text → never objective
  {
    name: "text question → null (manual/LLM queue)",
    question: { qtype: "text", scoring: "exact", points: 2, options: null },
    response: { text: "مد طبيعي" },
    expected: null,
  },
  {
    name: "paragraph question → null (manual/LLM queue)",
    question: { qtype: "paragraph", scoring: "exact", points: 3, options: null },
    response: { text: "long answer" },
    expected: null,
  },
  {
    // Practical tasks ("send a voice note") carry 0 marks. Scoring them 0
    // rather than null keeps 22 unmarkable items out of the teacher's manual
    // queue — the recording is still played back on the review screen.
    name: "task item → 0, never the manual queue",
    question: { qtype: "text", scoring: "manual", points: 0, options: null, is_task: true },
    response: { text: "" },
    expected: 0,
  },

  // grid → manual queue
  {
    name: "grid/manual → null",
    question: { qtype: "grid", scoring: "manual", points: 10, options: null },
    response: { grid: { r1: "c2" } },
    expected: null,
  },
  {
    name: "grid with grid response → null regardless",
    question: { qtype: "grid", scoring: "manual", points: 3, options: null },
    response: {},
    expected: null,
  },
];

describe("scoreObjective", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(scoreObjective(c.question, c.response)).toBe(c.expected);
    });
  }
});

// ─── jsonb parsing helpers ──────────────────────────────────────────────────

describe("parseResponse", () => {
  it("parses a selected response", () => {
    expect(parseResponse({ selected: [0, 2] })).toEqual({ selected: [0, 2] });
  });
  it("parses a text response", () => {
    expect(parseResponse({ text: "مد" })).toEqual({ text: "مد" });
  });
  it("parses a grid response", () => {
    expect(parseResponse({ grid: { a: "b" } })).toEqual({ grid: { a: "b" } });
  });
  it("drops non-numeric selected entries", () => {
    expect(parseResponse({ selected: [0, "x", 2, 1.5] })).toEqual({ selected: [0, 2] });
  });
  it("returns empty object for scalars / null / arrays", () => {
    expect(parseResponse(null)).toEqual({});
    expect(parseResponse("hi")).toEqual({});
    expect(parseResponse([1, 2])).toEqual({});
  });
});

describe("parseOptions", () => {
  it("parses valid options", () => {
    const raw = [{ position: 0, label: "A", value: "Alif", correct: true }];
    expect(parseOptions(raw)).toEqual(raw);
  });
  it("returns null for null / non-arrays / invalid entries", () => {
    expect(parseOptions(null)).toBeNull();
    expect(parseOptions("x")).toBeNull();
    expect(parseOptions([{ position: "a" }])).toBeNull();
  });
});

describe("parseRubric", () => {
  it("parses a valid rubric", () => {
    const raw = [{ id: "c1", desc: "correct origin", marks: 1 }];
    expect(parseRubric(raw)).toEqual(raw);
  });
  it("returns null for null / invalid shapes", () => {
    expect(parseRubric(null)).toBeNull();
    expect(parseRubric([{ id: 1 }])).toBeNull();
    expect(parseRubric({})).toBeNull();
  });
});

describe("parseAutoRubric", () => {
  it("parses stored LLM concept results", () => {
    const raw = [{ id: "c1", present: true, why: "term named" }];
    expect(parseAutoRubric(raw)).toEqual(raw);
  });
  it("returns null for invalid shapes", () => {
    expect(parseAutoRubric(null)).toBeNull();
    expect(parseAutoRubric([{ id: "c1", present: "yes" }])).toBeNull();
  });
});
