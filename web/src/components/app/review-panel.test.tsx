// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import {
  ReviewPanel,
  type ReviewQuestion,
  type ReviewAnswer,
  type ReviewVoiceNote,
} from "./review-panel";

// The panel is what's under test, not the server action or the router.
// The mock carries approveSubmission's parameter shape so assertions on
// mock.calls[0][1] / [2] typecheck — an argless vi.fn() types calls as [].
const approve = vi.hoisted(() =>
  vi.fn(
    async (
      _submissionId: string,
      _edits?: Record<string, number>,
      _comments?: Record<string, string>,
    ): Promise<{ pct: number | null; redo: boolean }> => ({ pct: null, redo: false }),
  ),
);
vi.mock("@/lib/marking/actions", () => ({ approveSubmission: approve }));
// One router for the whole file, so a test can ask where approving sent the
// teacher — a redo blanks the script they are looking at, and the panel has to
// leave the page rather than sit on an empty paper.
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// VoicePlayback signs a URL out of the private bucket the moment it mounts.
// jsdom has no Supabase and no network, so without this every recitation test
// would sit on "Loading recording…" forever.
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "blob:x" }, error: null }),
      }),
    },
  }),
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
  voiceNotes: ReviewVoiceNote[] = [],
) {
  return render(
    <ReviewPanel
      submissionId="s1"
      questions={questions}
      answers={answers}
      voiceNotes={voiceNotes}
      approved={approved}
    />,
  );
}

const note = (questionId: string): ReviewVoiceNote => ({
  question_id: questionId,
  storage_path: `uid/s1/a1/${questionId}.webm`,
  duration_s: 42,
});

const markField = (c: HTMLElement, answerId: string) =>
  c.querySelector<HTMLInputElement>(`#mark-${answerId}`)!;
/** Any mark field at all — for asserting that a question offers none. */
const markFields = (c: HTMLElement) => c.querySelectorAll('[id^="mark-"]');
const commentField = (c: HTMLElement, answerId: string) =>
  c.querySelector<HTMLTextAreaElement>(`#comment-${answerId}`);
const approveButton = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find((b) => /Approve|Save changes/.test(b.textContent ?? ""))!;
const runningTotal = (c: HTMLElement) =>
  c.querySelector(".font-heading")!.textContent;

beforeEach(() => {
  approve.mockClear();
  approve.mockResolvedValue({ pct: null, redo: false });
  router.push.mockClear();
  router.refresh.mockClear();
});
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

describe("ReviewPanel — where approving lands", () => {
  const editReleased = () => {
    const { container } = panel(
      [WRITTEN],
      [answer({ id: "a1", question_id: "q1", final_marks: 4 })],
      true,
    );
    fireEvent.click(
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Edit marks")!,
    );
    return container;
  };

  it("stays on the page when an edit of released marks still passes", async () => {
    const container = editReleased();
    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("leaves the page when an edit drops the mark below the pass line", async () => {
    approve.mockResolvedValue({ pct: 45, redo: true });
    const container = editReleased();
    fireEvent.change(markField(container, "a1"), { target: { value: "1" } });

    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    // the script this page was showing has just been blanked for the redo
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/teacher/homework"));
  });

  it("leaves the page on a first release, as it always did", async () => {
    const { container } = panel([WRITTEN], [answer({ id: "a1", question_id: "q1", auto_marks: 4 })]);
    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/teacher/homework"));
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

describe("ReviewPanel — recitation tasks", () => {
  // The bug this covers: the panel used to skip every question with no
  // `answers` row, and a task only ever had a recording — so the teacher was
  // shown a paper with the recitation silently missing from it.
  it("shows a recording on a task that has no answers row", async () => {
    const { container } = panel([TASK], [], false, [note("q3")]);
    expect(container.textContent).toContain("Student recitation");
    await vi.waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
  });

  it("offers neither a mark nor a comment on a task with no answers row", () => {
    const { container } = panel([TASK], [], false, [note("q3")]);
    expect(markFields(container)).toHaveLength(0);
    expect(container.querySelector('[id^="comment-"]')).toBeNull();
    // the column still exists, so the teacher reads "no mark" rather than
    // wondering whether one failed to render
    expect(container.textContent).toContain("–");
  });

  it("says so when a task has neither a row nor a recording", () => {
    const { container } = panel([TASK], []);
    expect(container.textContent).toContain("Nothing recorded for this task.");
    expect(container.querySelector("audio")).toBeNull();
  });

  it("never offers a mark field on a task, even when a row exists", () => {
    const { container } = panel(
      [TASK],
      [answer({ id: "a3", question_id: "q3", auto_marks: 0, response: { voice: "p" } })],
      false,
      [note("q3")],
    );
    expect(markFields(container)).toHaveLength(0);
  });

  it("keeps the comment box on a task with a row, keyed by the answer", async () => {
    const { container } = panel(
      [TASK],
      [answer({ id: "a3", question_id: "q3", auto_marks: 0, response: { voice: "p" } })],
      false,
      [note("q3")],
    );
    fireEvent.change(commentField(container, "a3")!, {
      target: { value: "Lengthen the madd." },
    });

    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][2]).toEqual({ a3: "Lengthen the madd." });
  });

  it("still skips an ordinary question the student never answered", () => {
    const { container } = panel([WRITTEN, TASK], [], false, [note("q3")]);
    expect(container.textContent).not.toContain("Q1");
    expect(container.textContent).toContain("Q2");
  });

  it("leaves a rowless task out of the running total, points and all", () => {
    const { container } = panel(
      [WRITTEN, TASK],
      [answer({ id: "a1", question_id: "q1", auto_marks: 3 })],
      false,
      [note("q3")],
    );
    // 3 of the written answer's 5, out of the paper's 8 — the task contributes
    // nothing but its own points, which is what a task worth 0 will do anyway
    expect(runningTotal(container)).toBe("3 / 8");
  });

  it("approves a paper with a rowless task on it", async () => {
    const { container } = panel(
      [WRITTEN, TASK],
      [answer({ id: "a1", question_id: "q1", auto_marks: 3 })],
      false,
      [note("q3")],
    );
    fireEvent.click(approveButton(container));
    await vi.waitFor(() => expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][1]).toEqual({ a1: 3 });
  });
});
