// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HomeworkForm } from "./homework-form";
import type { StudentQuestion } from "@/lib/homework/logic";

vi.mock("@/lib/homework/actions", () => ({
  saveAnswer: vi.fn(async () => ({ error: null })),
  submitHomework: vi.fn(async () => ({ error: null })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Stands in for the recorder, saying which layout it was given.
vi.mock("@/components/app/voice-recorder", () => ({
  VoiceRecorder: ({ layout }: { layout?: string }) => <span data-testid="recorder" data-layout={layout ?? "inline"} />,
}));

afterEach(cleanup);

const task: StudentQuestion = {
  id: "t1", position: 1, qtype: "text", prompt: "Read out each box.", points: 0,
  is_bonus: false, is_task: true, options: null,
};
const other: StudentQuestion = {
  id: "q1", position: 1, qtype: "text", prompt: "Name the rule.", points: 1,
  is_bonus: false, is_task: false, options: null,
};
const form = (questions: StudentQuestion[]) =>
  render(<HomeworkForm submissionId="sub1" questions={questions} existing={[]} status="draft" readOnly={false} />);

/**
 * Qāʿidah homework 2 is one recording made while reading down three book
 * pages: the student starts at the top and scrolls, so the recorder rides in
 * the bar that stays on screen, and the question points to it.
 */
describe("HomeworkForm: a homework that is one recording", () => {
  it("puts the recorder in the bottom bar and says so in the question", () => {
    const { getAllByTestId, container, getByText } = form([task]);
    const recs = getAllByTestId("recorder");
    expect(recs).toHaveLength(1);
    expect(recs[0].dataset.layout).toBe("bar");
    expect(container.querySelector(".submitbar")!.contains(recs[0])).toBe(true);
    expect(getByText(/Record button at the bottom of the screen/)).toBeTruthy();
  });

  it("keeps the recorder in its question when the homework has more than the task", () => {
    const { getAllByTestId, container } = form([{ ...other }, { ...task, position: 2 }]);
    const recs = getAllByTestId("recorder");
    expect(recs).toHaveLength(1);
    expect(recs[0].dataset.layout).toBe("inline");
    expect(container.querySelector(".submitbar")!.contains(recs[0])).toBe(false);
  });
});
