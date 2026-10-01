// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { QuestionBreakdown, type BreakdownQuestion } from "./question-breakdown";
import type { ScoreAnswer } from "@/lib/marking/responses";

afterEach(cleanup);

const question = (over: Partial<BreakdownQuestion> & { id: string }): BreakdownQuestion => ({
  qtype: "paragraph",
  scoring: "manual",
  prompt: "What is the definition of Tajweed?",
  points: 4,
  is_bonus: false,
  is_task: false,
  needs_key: false,
  options: null,
  rubric: null,
  ...over,
});

const mcq = (id: string) =>
  question({
    id,
    qtype: "mcq",
    scoring: "exact",
    prompt: "Which is idghām?",
    points: 1,
    options: [
      { position: 0, label: "Option 1", value: "Iẓhār", correct: false },
      { position: 1, label: "Option 2", value: "Idghām", correct: true },
    ],
  });

const answer = (
  submission: string,
  questionId: string,
  over: Partial<ScoreAnswer> = {},
): ScoreAnswer => ({
  submission_id: submission,
  question_id: questionId,
  response: {},
  auto_marks: null,
  final_marks: null,
  ...over,
});

const roster: Record<string, string> = { s1: "Aisha Khan", s2: "Bilal Ahmed" };
const attribution = (submissionId: string) =>
  roster[submissionId]
    ? { name: roster[submissionId], href: `/teacher/curriculum/1?student=${submissionId}` }
    : null;

describe("QuestionBreakdown: a question with a recitation", () => {
  it("puts the clip on the paper, and a player beside each option that has audio", () => {
    const url = "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/090006.mp3";
    const { getAllByRole, container } = render(
      <QuestionBreakdown
        questions={[
          {
            ...mcq("q1"),
            media: {
              clip: { url, start_ms: 3590, end_ms: 6200 },
              option_audio: { "0": { url } },
            },
          },
        ]}
        answers={[]}
        attribution={() => null}
      />,
    );
    expect(getAllByRole("button", { name: "Play recitation" })).toHaveLength(1);
    expect(getAllByRole("button", { name: /^Play option \d$/ })).toHaveLength(1);
    expect(container.querySelectorAll("audio")).toHaveLength(2);
  });

  it("a question without media has no player", () => {
    const { queryByRole } = render(
      <QuestionBreakdown questions={[mcq("q1")]} answers={[]} attribution={() => null} />,
    );
    expect(queryByRole("button", { name: "Play recitation" })).toBeNull();
  });
});

describe("QuestionBreakdown with no responses", () => {
  it("shows the paper: the key, and no tallies", () => {
    const { container, queryByText } = render(
      <QuestionBreakdown questions={[mcq("q1")]} answers={[]} attribution={() => null} />,
    );
    expect(container.textContent).toContain("Which is idghām?");
    expect(container.textContent).toContain("Idghām");
    // the correct option is still marked, but nothing counts anything
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(queryByText("average", { exact: false })).toBeNull();
  });

  it("warns about a question with no key and no mark scheme", () => {
    const { container } = render(
      <QuestionBreakdown questions={[question({ id: "q1" })]} answers={[]} attribution={() => null} />,
    );
    expect(container.textContent).toContain("No answer key or mark scheme");
  });
});

describe("QuestionBreakdown with responses", () => {
  it("counts each option and states the class average", () => {
    const { container } = render(
      <QuestionBreakdown
        questions={[mcq("q1")]}
        answers={[
          answer("s1", "q1", { response: { selected: [1] }, auto_marks: 1 }),
          answer("s2", "q1", { response: { selected: [0] }, auto_marks: 0 }),
        ]}
        attribution={attribution}
      />,
    );
    expect(container.textContent).toContain("50% average");
    expect(container.textContent).toContain("2 marked");
  });

  it("attributes every written answer and shows the mark it earned", () => {
    const { container, getByText } = render(
      <QuestionBreakdown
        questions={[question({ id: "q1" })]}
        answers={[
          answer("s1", "q1", { response: { text: "Giving each letter its right" }, final_marks: 4 }),
          answer("s2", "q1", { response: { text: "" }, final_marks: 0 }),
        ]}
        attribution={attribution}
      />,
    );
    expect(container.textContent).toContain("Giving each letter its right");
    expect(getByText("Aisha Khan").getAttribute("href")).toContain("student=s1");
    expect(container.textContent).toContain("4/4");
    expect(container.textContent).toContain("No answer given.");
    // the blank is reported alongside the average rather than hidden
    expect(container.textContent).toContain("1 left blank");
  });

  it("drops an answer from a student outside the teacher's class", () => {
    const { container, queryByText } = render(
      <QuestionBreakdown
        questions={[question({ id: "q1" })]}
        answers={[answer("other", "q1", { response: { text: "Not theirs" }, final_marks: 4 })]}
        attribution={attribution}
      />,
    );
    expect(queryByText("Not theirs")).toBeNull();
    // the mark still counts towards the class average — the caller only ever
    // passes its own class's rows, so an unattributable one is a data error
    expect(container.textContent).toContain("100% average");
  });

  it("says how many chose nothing at all", () => {
    const { container } = render(
      <QuestionBreakdown
        questions={[mcq("q1")]}
        answers={[
          answer("s1", "q1", { response: { selected: [] }, auto_marks: 0 }),
          answer("s2", "q1", { response: { selected: [1] }, auto_marks: 1 }),
        ]}
        attribution={attribution}
      />,
    );
    expect(container.textContent).toContain("1 chose nothing");
  });
});
