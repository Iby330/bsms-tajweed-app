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

/**
 * A page left open across a release keeps the old build's server-action ids;
 * after the deploy every save and hand-in throws, and the student was told to
 * check their connection — on a connection that was fine (5 Oct, 17:00 deadline).
 */
describe("HomeworkForm on a page older than the app", () => {
  const reachable = (ok: boolean) =>
    vi.stubGlobal("fetch", vi.fn(async () => (ok ? new Response(null, { status: 200 }) : Promise.reject(new TypeError("offline")))));
  afterEach(() => vi.unstubAllGlobals());

  it("says the app was updated and offers a reload, when the site answers but the hand-in throws", async () => {
    reachable(true);
    submitHomework.mockRejectedValueOnce(new Error("Server Action not found"));
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const { getByRole, findByText } = form();
    fireEvent.click(getByRole("button", { name: "Submit homework" }));
    expect(await findByText(/The app was updated while this page was open/)).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Reload page" }));
    expect(reload).toHaveBeenCalled();
  });

  it("still blames the connection when the site cannot be reached either", async () => {
    reachable(false);
    submitHomework.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { getByRole, findByText, queryByRole } = form();
    fireEvent.click(getByRole("button", { name: "Submit homework" }));
    expect(await findByText("Could not hand in. Check your connection and try again.")).toBeTruthy();
    expect(queryByRole("button", { name: "Reload page" })).toBeNull();
  });

  it("says the same when an answer will not save for that reason", async () => {
    reachable(true);
    // An earlier test queues a reply it never uses; start from a clean mock.
    saveAnswer.mockReset();
    saveAnswer.mockRejectedValue(new Error("Server Action not found"));
    const { getByRole, findAllByText } = form();
    fireEvent.change(getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(getByRole("button", { name: "Submit homework" }));
    expect((await findAllByText(/The app was updated while this page was open/)).length).toBeGreaterThan(0);
    expect(getByRole("button", { name: "Reload page" })).toBeTruthy();
    expect(submitHomework).not.toHaveBeenCalled();
    saveAnswer.mockReset();
    saveAnswer.mockImplementation(async (_s: string, _q: string, r: unknown) => { calls.push(`save ${JSON.stringify(r)}`); return { error: null }; });
  });
});
