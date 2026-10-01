// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { HomeworkForm } from "./homework-form";
import type { StudentQuestion } from "@/lib/homework/logic";

const calls = vi.hoisted(() => [] as string[]);
const saveAnswer = vi.hoisted(() =>
  vi.fn(async (_s: string, _q: string, r: unknown) => {
    calls.push(`save ${JSON.stringify(r)}`);
    return { error: null as string | null };
  }),
);
const submitHomework = vi.hoisted(() =>
  vi.fn(async (_s: string) => {
    calls.push("submit");
    return { error: null as string | null };
  }),
);
vi.mock("@/lib/homework/actions", () => ({ saveAnswer, submitHomework }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Not under test, and it reaches for storage and the microphone.
vi.mock("@/components/app/voice-recorder", () => ({ VoiceRecorder: () => null }));

const question: StudentQuestion = {
  id: "q1", position: 1, qtype: "text", prompt: "Name the rule.", points: 1,
  is_bonus: false, is_task: false, options: null,
};

const form = () =>
  render(
    <HomeworkForm submissionId="sub1" questions={[question]} existing={[]} status="draft" readOnly={false} />,
  );

afterEach(() => { cleanup(); vi.clearAllMocks(); calls.length = 0; });

describe("HomeworkForm hand-in", () => {
  it("saves the answer still waiting on autosave before handing in", async () => {
    const { getByRole } = form();
    fireEvent.change(getByRole("textbox"), { target: { value: "mad tabi'i" } });
    // straight to Submit, inside the autosave pause
    fireEvent.click(getByRole("button", { name: "Submit homework" }));
    await waitFor(() => expect(submitHomework).toHaveBeenCalledOnce());
    expect(calls).toEqual([`save ${JSON.stringify({ text: "mad tabi'i" })}`, "submit"]);
  });

  it("does not hand in when the last answer will not save, and says why", async () => {
    saveAnswer.mockResolvedValueOnce({ error: "That answer is too long to save." })
      .mockResolvedValueOnce({ error: "That answer is too long to save." });
    const { getByRole, findByText } = form();
    fireEvent.change(getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(getByRole("button", { name: "Submit homework" }));
    expect(await findByText(/Not handed in.*too long/)).toBeTruthy();
    expect(submitHomework).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the hand-in is refused", async () => {
    submitHomework.mockResolvedValueOnce({ error: "Record every task before you hand in." });
    const { getByRole, findByText } = form();
    fireEvent.click(getByRole("button", { name: "Submit homework" }));
    expect(await findByText("Record every task before you hand in.")).toBeTruthy();
  });
});
