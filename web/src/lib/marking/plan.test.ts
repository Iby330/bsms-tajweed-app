import { describe, expect, it, vi } from "vitest";
import {
  mapWithConcurrency,
  planAnswerUpdates,
  planFinalMarks,
  planLlmJobs,
  type LlmMark,
  type MarkedAnswer,
  type MarkingAnswer,
  type MarkingQuestion,
} from "./plan";
import type { Json } from "@/lib/database.types";

/* ── fixtures ───────────────────────────────────────────────────────────── */

const SUB = "11111111-1111-1111-1111-111111111111";

function question(over: Partial<MarkingQuestion> & { id: string }): MarkingQuestion {
  return {
    qtype: "mcq",
    scoring: "exact",
    points: 1,
    prompt: "Q",
    is_bonus: false,
    is_task: false,
    options: null,
    rubric: null,
    ...over,
  };
}

function answer(id: string, questionId: string, response: Json): MarkingAnswer {
  return { id, submission_id: SUB, question_id: questionId, response };
}

const options = (correct: number[], total = 4) =>
  Array.from({ length: total }, (_, i) => ({
    position: i,
    label: `Option ${i}`,
    value: `Value ${i}`,
    correct: correct.includes(i),
  }));

const rubric = [
  { id: "c1", desc: "names the term", marks: 1 },
  { id: "c2", desc: "and its length", marks: 1 },
];

/** One of each kind the old loop had to deal with. */
const questions: MarkingQuestion[] = [
  question({ id: "q-mcq", qtype: "mcq", points: 2, options: options([1]) }),
  question({
    id: "q-per-option",
    qtype: "checkbox",
    scoring: "per_option",
    points: 3,
    options: options([0, 1, 2], 6),
  }),
  question({ id: "q-llm", qtype: "text", points: 2, prompt: "Define Mad Tabi'i", rubric }),
  question({ id: "q-manual", qtype: "paragraph", scoring: "manual", points: 4 }),
  question({ id: "q-grid", qtype: "grid", scoring: "manual", points: 5 }),
  question({ id: "q-task", qtype: "text", scoring: "manual", points: 0, is_task: true }),
];

const answers: MarkingAnswer[] = [
  answer("a-mcq", "q-mcq", { selected: [1] }),
  answer("a-per-option", "q-per-option", { selected: [0, 1, 4] }),
  answer("a-llm", "q-llm", { text: "مد طبيعي — two counts" }),
  answer("a-manual", "q-manual", { text: "a long written answer" }),
  answer("a-grid", "q-grid", { grid: { r1: "c2" } }),
  answer("a-task", "q-task", { text: "" }),
  // an answer whose question is gone: the old loop `continue`d past it
  answer("a-orphan", "q-deleted", { selected: [0] }),
];

const modelMarked: LlmMark = {
  marks: 1,
  concepts: [
    { id: "c1", present: true, why: "named it" },
    { id: "c2", present: false, why: "no length" },
  ],
};

const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((r) => [r.id, r]));

/* ── planAnswerUpdates ──────────────────────────────────────────────────── */

describe("planAnswerUpdates", () => {
  const marks = new Map<string, LlmMark | null>([["a-llm", modelMarked]]);

  it("scores objective answers in code, exactly as the loop did", () => {
    const rows = byId(planAnswerUpdates(answers, questions, marks));
    expect(rows.get("a-mcq")?.auto_marks).toBe(2);
    // 3 points × max(0, 2 hits − 1 miss)/3 correct = 1
    expect(rows.get("a-per-option")?.auto_marks).toBe(1);
    expect(rows.get("a-mcq")?.auto_rubric).toBeNull();
    expect(rows.get("a-per-option")?.auto_rubric).toBeNull();
  });

  it("writes the model's marks and its reasoning for a rubric answer", () => {
    const rows = byId(planAnswerUpdates(answers, questions, marks));
    expect(rows.get("a-llm")?.auto_marks).toBe(1);
    expect(rows.get("a-llm")?.auto_rubric).toEqual(modelMarked.concepts);
  });

  it("leaves unmarkable answers in the manual queue", () => {
    const rows = byId(planAnswerUpdates(answers, questions, marks));
    for (const id of ["a-manual", "a-grid"]) {
      expect(rows.get(id)?.auto_marks).toBeNull();
      expect(rows.get(id)?.auto_rubric).toBeNull();
    }
    // a practical task scores 0 rather than null — 22 of them would be noise
    expect(rows.get("a-task")?.auto_marks).toBe(0);
  });

  it("treats a failed model call the same as a missing one: manual queue", () => {
    const failed = planAnswerUpdates(answers, questions, new Map([["a-llm", null]]));
    const absent = planAnswerUpdates(answers, questions, new Map());
    expect(byId(failed).get("a-llm")?.auto_marks).toBeNull();
    expect(byId(failed).get("a-llm")?.auto_rubric).toBeNull();
    expect(absent).toEqual(failed);
  });

  it("skips an answer whose question no longer exists", () => {
    const rows = planAnswerUpdates(answers, questions, marks);
    expect(rows.map((r) => r.id)).not.toContain("a-orphan");
    expect(rows).toHaveLength(answers.length - 1);
  });

  it("carries every NOT NULL column through untouched", () => {
    const rows = planAnswerUpdates(answers, questions, marks);
    for (const row of rows) {
      const source = answers.find((a) => a.id === row.id);
      expect(row.submission_id).toBe(source?.submission_id);
      expect(row.question_id).toBe(source?.question_id);
      expect(row.response).toEqual(source?.response);
    }
  });

  it("writes a uniform row shape — and never touches final_marks", () => {
    const rows = planAnswerUpdates(answers, questions, marks);
    const expected = [
      "auto_marks",
      "auto_rubric",
      "id",
      "question_id",
      "response",
      "submission_id",
    ];
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(expected);
    }
  });

  it("keeps the answers in submission order", () => {
    const rows = planAnswerUpdates(answers, questions, marks);
    expect(rows.map((r) => r.id)).toEqual([
      "a-mcq", "a-per-option", "a-llm", "a-manual", "a-grid", "a-task",
    ]);
  });

  it("is idempotent — marking twice plans the same write", () => {
    expect(planAnswerUpdates(answers, questions, marks)).toEqual(
      planAnswerUpdates(answers, questions, marks),
    );
  });

  it("plans nothing when there are no questions to mark against", () => {
    expect(planAnswerUpdates(answers, [], marks)).toEqual([]);
  });
});

/* ── planLlmJobs ────────────────────────────────────────────────────────── */

describe("planLlmJobs", () => {
  it("sends only free-text answers that have a rubric", () => {
    const jobs = planLlmJobs(answers, questions);
    expect(jobs).toEqual([
      {
        answerId: "a-llm",
        prompt: "Define Mad Tabi'i",
        rubric,
        answer: "مد طبيعي — two counts",
      },
    ]);
  });

  it("never sends anything but question, rubric and answer", () => {
    const [job] = planLlmJobs(answers, questions);
    expect(Object.keys(job).sort()).toEqual(["answer", "prompt", "rubric", "answerId"].sort());
    expect(JSON.stringify(job)).not.toMatch(/submission_id|full_name|student/);
  });

  it("reads a missing or malformed response as a blank answer", () => {
    const q = [question({ id: "q1", qtype: "text", points: 2, rubric })];
    const jobs = planLlmJobs(
      [
        answer("a1", "q1", {}),
        answer("a2", "q1", { selected: [0] }),
        answer("a3", "q1", "not an object"),
        answer("a4", "q1", null),
      ],
      q,
    );
    expect(jobs.map((j) => j.answer)).toEqual(["", "", "", ""]);
  });

  it("agrees with planAnswerUpdates about which answers the model marks", () => {
    const jobs = planLlmJobs(answers, questions);
    const marked = planAnswerUpdates(
      answers,
      questions,
      new Map(jobs.map((j) => [j.answerId, modelMarked])),
    );
    const withRubric = marked.filter((r) => r.auto_rubric !== null).map((r) => r.id);
    expect(withRubric).toEqual(jobs.map((j) => j.answerId));
  });
});

/* ── planFinalMarks ─────────────────────────────────────────────────────── */

describe("planFinalMarks", () => {
  const marked: MarkedAnswer[] = [
    { ...answer("a1", "q1", { selected: [1] }), auto_marks: 2 },
    { ...answer("a2", "q2", { text: "…" }), auto_marks: null },
    { ...answer("a3", "q3", { text: "…" }), auto_marks: 1.5 },
  ];

  it("takes the teacher's edit where there is one", () => {
    const rows = byId(planFinalMarks(marked, { a1: 1, a2: 4 }));
    expect(rows.get("a1")?.final_marks).toBe(1);
    expect(rows.get("a2")?.final_marks).toBe(4);
  });

  it("falls back to the automatic mark, or 0 when there wasn't one", () => {
    const rows = byId(planFinalMarks(marked, {}));
    expect(rows.get("a1")?.final_marks).toBe(2);
    expect(rows.get("a2")?.final_marks).toBe(0);
    expect(rows.get("a3")?.final_marks).toBe(1.5);
  });

  it("ignores a non-finite edit rather than writing NaN", () => {
    const rows = byId(planFinalMarks(marked, { a1: NaN, a3: Infinity }));
    expect(rows.get("a1")?.final_marks).toBe(2);
    expect(rows.get("a3")?.final_marks).toBe(1.5);
  });

  it("accepts an explicit zero as an edit", () => {
    expect(byId(planFinalMarks(marked, { a1: 0 })).get("a1")?.final_marks).toBe(0);
  });

  it("carries the NOT NULL columns and leaves the automatic marks alone", () => {
    const rows = planFinalMarks(marked, {});
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "final_marks", "id", "question_id", "response", "submission_id",
        "teacher_comment",
      ]);
      expect(row.submission_id).toBe(SUB);
    }
  });

  it("marks every answer, including ones with no question row", () => {
    expect(planFinalMarks(marked, {})).toHaveLength(3);
    expect(planFinalMarks([], { a1: 3 })).toEqual([]);
  });

  it("writes the teacher's comment against its answer", () => {
    const rows = byId(planFinalMarks(marked, {}, { a2: "Watch the madd here." }));
    expect(rows.get("a2")?.teacher_comment).toBe("Watch the madd here.");
  });

  it("trims a comment", () => {
    const rows = byId(planFinalMarks(marked, {}, { a2: "  good work  " }));
    expect(rows.get("a2")?.teacher_comment).toBe("good work");
  });

  it("stores a blank or whitespace-only comment as null", () => {
    const rows = byId(planFinalMarks(marked, {}, { a1: "", a2: "   " }));
    expect(rows.get("a1")?.teacher_comment).toBeNull();
    expect(rows.get("a2")?.teacher_comment).toBeNull();
  });

  it("nulls the comment on every answer the teacher left alone", () => {
    // re-approving with an emptied box has to take a released comment down,
    // which only works because the column is written on every row
    const rows = byId(planFinalMarks(marked, {}, { a1: "kept" }));
    expect(rows.get("a1")?.teacher_comment).toBe("kept");
    expect(rows.get("a2")?.teacher_comment).toBeNull();
    expect(rows.get("a3")?.teacher_comment).toBeNull();
  });

  it("defaults to no comments at all when none are passed", () => {
    for (const row of planFinalMarks(marked, { a1: 1 })) {
      expect(row.teacher_comment).toBeNull();
    }
  });
});

/* ── mapWithConcurrency ─────────────────────────────────────────────────── */

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("returns results in input order however they finish", async () => {
    const delays = [30, 1, 20, 5, 0, 12];
    const out = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await tick(ms);
      return `${i}:${ms}`;
    });
    expect(out).toEqual(delays.map((ms, i) => `${i}:${ms}`));
  });

  it("never runs more than `limit` at once", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 5, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(2);
      inFlight--;
      return null;
    });
    expect(peak).toBe(5);
  });

  it("does not spin up more workers than there are items", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2], 5, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(1);
      inFlight--;
      return n * 2;
    });
    expect(peak).toBe(2);
    expect(out).toEqual([2, 4]);
  });

  it("still makes progress with a nonsense limit", async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n) => n + 1)).toEqual([2, 3, 4]);
    expect(await mapWithConcurrency([1, 2, 3], -4, async (n) => n + 1)).toEqual([2, 3, 4]);
  });

  it("handles an empty list without calling anything", async () => {
    const fn = vi.fn();
    expect(await mapWithConcurrency([], 5, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects with the first error — the contract markSubmission relies on", async () => {
    // markFreeText answers a rate limit with null, so nothing here throws in
    // normal running; a throw means a broken environment and must abort the
    // batch rather than write "unmarkable" over every answer.
    const seen: number[] = [];
    const run = mapWithConcurrency([0, 1, 2, 3], 2, async (n) => {
      seen.push(n);
      await tick(1);
      if (n === 1) throw new Error("GROQ_API_KEY is not set");
      return n;
    });
    await expect(run).rejects.toThrow("GROQ_API_KEY is not set");
    await tick(20);
    // the other workers were not cancelled — they drained the queue
    expect(seen.sort()).toEqual([0, 1, 2, 3]);
  });

  it("leaves no unhandled rejection when several items fail", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      const run = mapWithConcurrency([0, 1, 2, 3], 4, async (n) => {
        await tick(n);
        throw new Error(`boom ${n}`);
      });
      await expect(run).rejects.toThrow("boom 0");
      await tick(20);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });
});
