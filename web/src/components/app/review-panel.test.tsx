// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ReviewPanel, type ReviewQuestion, type ReviewAnswer } from "./review-panel";

// The panel is what's under test, not the server action or the router.
// The mock carries approveSubmission's parameter shape so assertions on
// mock.calls[0][1] / [2] typecheck — an argless vi.fn() types calls as [].
const approve = vi.hoisted(() =>
  vi.fn(
    async (
      _submissionId: string,
      _edits?: Record<string, number>,
      _comments?: Record<string, string>,
    ) => {},
  ),
);
vi.mock("@/lib/marking/actions", () => ({ approveSubmission: approve }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const question = (over: Partial<ReviewQuestion> & { id: string; position: number }): ReviewQuestion => ({
  prompt: "Prompt",
  points: 5,
  qtype: "paragraph",
  is_bonus: false,
  is_task: false,
  options: null,
  ...over,
});

const answer = (over: Partial<ReviewAnswer> & { id: string; question_id: string }): ReviewAnswer => ({
  response: { text: "an answer" },
  auto_marks: null,
  auto_rubric: null,
  final_marks: null,
  teacher_comment: null,
  ...over,
});

const WRITTEN = question({ id: "q1", position: 1 });
const MCQ = question({
  id: "q2",
  position: 2,
  qtype: "mcq",
  points: 2,
  options: [
    { position: 0, label: "Option 0", value: "right", correct: true },
    { position: 1, label: "Option 1", value: "wrong", correct: false },
  ],
});
const TASK = question({ id: "q3", position: 3, is_task: true, points: 3 });

function panel(
  questions: ReviewQuestion[],
  answers: ReviewAnswer[],
  approved = false,
) {
  return render(
    <ReviewPanel
      submissionId="s1"
      questions={questions}
      answers={answers}
      approved={approved}
    />,
  );
}

const markField = (c: HTMLElement, answerId: string) =>
  c.querySelector<HTMLInputElement>(`#mark-${answerId}`)!;
const commentField = (c: HTMLElement, answerId: string) =>
  c.querySelector<HTMLTextAreaElement>(`#comment-${answerId}`);
const approveButton = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find((b) => /Approve|Save changes/.test(b.textContent ?? ""))!;
const runningTotal = (c: HTMLElement) =>
  c.querySelector(".font-heading")!.textContent;

beforeEach(() => approve.mockClear());
// This config has no `globals`, so testing-library never registers its own
// afterEach. Left to pile up, every render stays in document.body — and jsdom
// resolves a bare `#id` against the whole document before checking it is inside
// the container, so the SECOND test onwards would read the first test's panel.
afterEach(cleanup);

describe("ReviewPanel — entering a mark", () => {
  it("is a typed field, not a number spinner", () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1" })]);
    const field = markField(container, "a1");
    expect(field.getAttribute("type")).not.toBe("number");
    expect(field.getAttribute("inputmode")).toBe("decimal");
  });

  it("shows what the mark is out of, next to the field", () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1" })]);
    const described = container.querySelector(
      `#${markField(container, "a1").getAttribute("aria-describedby")}`,
    );
    expect(described?.textContent).toBe("/ 5");
  });

  it("accepts a half mark and counts it in the running total", () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1" })]);
    fireEvent.change(markField(container, "a1"), { target: { value: "2.5" } });
    expect(runningTotal(container)).toBe("2.5 / 5");
  });

  it("flags a mark above the question's points and blocks approval", () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1" })]);
    fireEvent.change(markField(container, "a1"), { target: { value: "9" } });

    expect(markField(container, "a1").getAttribute("aria-invalid")).toBe("true");
    expect(approveButton(container).disabled).toBe(true);
    expect(container.textContent).toContain("a mark has to be a number from 0 to 5");
  });

  it("lets approval through once the mark is back in range", () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1" })]);
    fireEvent.change(markField(container, "a1"), { target: { value: "9" } });
    fireEvent.change(markField(container, "a1"), { target: { value: "4" } });
    expect(approveButton(container).disabled).toBe(false);
  });

  it("saves exactly the marks the running total was showing", async () => {
    const { container } = panel(
      [WRITTEN, MCQ],
      [
        answer({ id: "a1", question_id: "q1", auto_marks: 3 }),
        answer({ id: "a2", question_id: "q2", auto_marks: 2 }),
      ],
    );
    fireEvent.change(markField(container, "a1"), { target: { value: "4" } });
    expect(runningTotal(container)).toBe("6 / 7");

    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][1]).toEqual({ a1: 4, a2: 2 });
  });

  it("treats a cleared field as zero, as the total shows", async () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1", auto_marks: 3 })]);
    fireEvent.change(markField(container, "a1"), { target: { value: "" } });
    expect(runningTotal(container)).toBe("0 / 5");

    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][1]).toEqual({ a1: 0 });
  });
});

describe("ReviewPanel — commenting", () => {
  it("offers a comment box on a written answer and on a recitation task", () => {
    const { container } = panel(
      [WRITTEN, TASK],
      [answer({ id: "a1", question_id: "q1" }), answer({ id: "a3", question_id: "q3" })],
    );
    expect(commentField(container, "a1")).not.toBeNull();
    expect(commentField(container, "a3")).not.toBeNull();
  });

  it("offers none on multiple choice", () => {
    const { container } = panel([MCQ], [answer({ id: "a2", question_id: "q2" })]);
    expect(commentField(container, "a2")).toBeNull();
  });

  it("sends the comment with the marks", async () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1", auto_marks: 3 })]);
    fireEvent.change(commentField(container, "a1")!, {
      target: { value: "Watch the madd." },
    });

    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][2]).toEqual({ a1: "Watch the madd." });
  });

  it("starts from the comment already on the answer", () => {
    const { container } = panel(
      [WRITTEN],
      [answer({ id: "a1", question_id: "q1", teacher_comment: "said before" })],
    );
    expect(commentField(container, "a1")!.value).toBe("said before");
  });

  it("sends an emptied box, so a released comment can be taken back down", async () => {
    const { container } = panel(
      [WRITTEN],
      [answer({ id: "a1", question_id: "q1", auto_marks: 3, teacher_comment: "said before" })],
      true,
    );
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Edit marks")!);
    fireEvent.change(commentField(container, "a1")!, { target: { value: "" } });

    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][2]).toEqual({ a1: "" });
  });

  it("hides the box on an approved submission with nothing written", () => {
    const { container } = panel(
      [WRITTEN],
      [answer({ id: "a1", question_id: "q1", final_marks: 4 })],
      true,
    );
    expect(commentField(container, "a1")).toBeNull();
  });

  it("still shows a written comment on an approved submission, read-only", () => {
    const { container } = panel(
      [WRITTEN],
      [answer({ id: "a1", question_id: "q1", final_marks: 4, teacher_comment: "well done" })],
      true,
    );
    const box = commentField(container, "a1")!;
    expect(box.value).toBe("well done");
    expect(box.disabled).toBe(true);
  });
});

describe("ReviewPanel — model answer", () => {
  const RUBRIC = [
    { id: "c1", desc: "Names the rule", marks: 1 },
    { id: "c2", desc: "Gives a correct example", marks: 2 },
  ];

  it("shows every concept's description and marks", () => {
    const { container } = panel(
      [question({ id: "q1", position: 1, rubric: RUBRIC })],
      [answer({ id: "a1", question_id: "q1" })],
    );
    expect(container.textContent).toContain("Model answer");
    expect(container.textContent).toContain("Names the rule");
    expect(container.textContent).toContain("Gives a correct example");
  });

  it("reads '1 mark' singular, not '1 marks'", () => {
    const { container } = panel(
      [question({ id: "q1", position: 1, rubric: RUBRIC })],
      [answer({ id: "a1", question_id: "q1" })],
    );
    expect(container.textContent).toContain("1 mark");
    expect(container.textContent).not.toContain("1 marks");
    expect(container.textContent).toContain("2 marks");
  });

  it("renders nothing when rubric is null", () => {
    const { container } = panel(
      [question({ id: "q1", position: 1, rubric: null })],
      [answer({ id: "a1", question_id: "q1" })],
    );
    expect(container.textContent).not.toContain("Model answer");
  });

  it("renders nothing for a task, even with a rubric", () => {
    const { container } = panel(
      [question({ id: "q3", position: 3, is_task: true, rubric: RUBRIC })],
      [answer({ id: "a3", question_id: "q3" })],
    );
    expect(container.textContent).not.toContain("Model answer");
  });

  it("falls back to the rubric's own wording when auto_rubric carries no `why`", () => {
    const { container } = panel(
      [question({ id: "q1", position: 1, rubric: RUBRIC })],
      [
        answer({
          id: "a1",
          question_id: "q1",
          auto_rubric: [{ id: "c1", present: true }],
        }),
      ],
    );
    expect(container.textContent).toContain("Names the rule");
    // the bare concept id must never leak onto the page as a stand-in label
    expect(container.textContent).not.toMatch(/\bc1\b/);
  });
});

describe("ReviewPanel — multiple choice", () => {
  // Fill = right or wrong, ring = picked. The classes are the assertion because
  // they ARE the feature: nothing on the row says "answer" in words when the
  // student happened to choose it.
  const rowFor = (c: HTMLElement, value: string) =>
    [...c.querySelectorAll("li")].find((li) => li.textContent?.includes(value))!;

  it("fills the correct option green even when the student did not pick it", () => {
    const { container } = panel([MCQ], [answer({ id: "a2", question_id: "q2", response: { selected: [1] } })]);
    const right = rowFor(container, "right");
    expect(right.className).toContain("bg-ok/10");
    // not picked, so no ring — the fill alone says it is the answer
    expect(right.className).not.toContain("ring-1");
    expect(right.textContent).toContain("answer");
  });

  it("rings and reddens the option they picked when it is wrong", () => {
    const { container } = panel([MCQ], [answer({ id: "a2", question_id: "q2", response: { selected: [1] } })]);
    const wrong = rowFor(container, "wrong");
    expect(wrong.className).toContain("bg-danger/10");
    expect(wrong.className).toContain("ring-1");
    expect(wrong.textContent).toContain("chose");
  });

  it("shows one row as both chosen and correct when they got it right", () => {
    const { container } = panel([MCQ], [answer({ id: "a2", question_id: "q2", response: { selected: [0] } })]);
    const right = rowFor(container, "right");
    expect(right.className).toContain("bg-ok/10");
    expect(right.className).toContain("ring-1");
    expect(right.textContent).toContain("chose");
  });

  it("marks every correct option on a checkbox question", () => {
    const CHECKBOX = question({
      id: "q4",
      position: 4,
      qtype: "checkbox",
      points: 2,
      options: [
        { position: 0, label: "Option 0", value: "alpha", correct: true },
        { position: 1, label: "Option 1", value: "beta", correct: true },
        { position: 2, label: "Option 2", value: "gamma", correct: false },
      ],
    });
    const { container } = panel([CHECKBOX], [answer({ id: "a4", question_id: "q4", response: { selected: [0] } })]);
    expect(rowFor(container, "alpha").className).toContain("bg-ok/10");
    // the correct one they missed is still filled — that is the whole point
    expect(rowFor(container, "beta").className).toContain("bg-ok/10");
    expect(rowFor(container, "beta").className).not.toContain("ring-1");
    expect(rowFor(container, "gamma").className).not.toContain("bg-ok/10");
  });

  it("still marks the answer when nothing was selected", () => {
    const { container } = panel([MCQ], [answer({ id: "a2", question_id: "q2", response: { selected: [] } })]);
    const right = rowFor(container, "right");
    expect(right.className).toContain("bg-ok/10");
    expect([...container.querySelectorAll("li")].every((li) => !li.className.includes("ring-1"))).toBe(true);
  });
});
