// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { ReviewLogger } from "./review-logger";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/lib/hifz/review-actions", () => ({
  logMistake: vi.fn(async () => "new-id"),
  removeMistake: vi.fn(async () => {}),
  submitSession: vi.fn(async () => {}),
}));
import { logMistake, submitSession } from "@/lib/hifz/review-actions";
vi.mock("@/lib/hifz/hearing-actions", () => ({
  submitHearing: vi.fn(async () => {}),
}));
import { submitHearing } from "@/lib/hifz/hearing-actions";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", glyph: null, isEnd: false, page: 604, line: 12, ...over,
});
const pages = groupIntoPages([w({}), w({ position: 2, text: "أَعُوذُ" })]);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// Dialog renders are slow under full-suite worker contention — the default
// 5s timeout flakes even though every interaction completes.
const SLOW = 20_000;

describe("ReviewLogger", () => {
  it("logs a tapped word through the sheet and bumps the count", async () => {
    render(<ReviewLogger sessionId="s1" reciterName="Bilal" pages={pages} initialMistakes={[]} />);
    expect(screen.getByText(/0 mistakes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(logMistake).toHaveBeenCalledWith(
      "s1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
    expect(await screen.findByText(/1 mistake/, undefined, { timeout: 10_000 })).toBeTruthy();
  }, SLOW);
  it("submits flags and note from the wrap-up", async () => {
    render(<ReviewLogger sessionId="s1" reciterName="Bilal" pages={pages} initialMistakes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByLabelText("Weak hifdh overall"));
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));
    expect(submitSession).toHaveBeenCalledWith("s1", ["weak_hifz"], "");
  }, SLOW);
});

describe("ReviewLogger in hearing mode", () => {
  const names = { 114: { en: "An-Nas", ar: "الناس" }, 113: { en: "Al-Falaq", ar: "الفلق" } };
  const run = [{ number: 114, name: "An-Nas" }, { number: 113, name: "Al-Falaq" }];
  const starter = (id = "h1") =>
    vi.fn(async (r: { from: number; to: number }) => ({ id, from: r.from, to: r.to }));
  const props = (start = starter()) => ({
    from: 114, minEnd: 78, run, names, passedBefore: {}, start,
  });
  const mark = (over: Partial<MistakeRow>): MistakeRow => ({
    id: "m1", session_id: "draft-9", surah_number: 114, ayah_number: 1, word_position: 1,
    category: "hifz", detail: null, note: null, created_at: "2026-09-30T00:00:00Z", ...over,
  });
  const begin = async (start: ReturnType<typeof starter>) => {
    fireEvent.click(screen.getByRole("button", { name: "Start hearing" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "End hearing" }, { timeout: 10_000 });
  };

  it("before a hearing, offers Start hearing and no End hearing", () => {
    render(<ReviewLogger mode="hearing" sessionId={null} reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={props()} />);
    expect(screen.getByRole("button", { name: "Start hearing" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End hearing" })).toBeNull();
  });

  it("before a hearing, a tap logs nothing and starts nothing", () => {
    const start = starter();
    render(<ReviewLogger mode="hearing" sessionId={null} reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={props(start)} />);
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hifdh" })).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(logMistake).not.toHaveBeenCalled();
  }, SLOW);

  it("before a hearing, a word with history shows it read-only", () => {
    const start = starter();
    render(<ReviewLogger mode="hearing" sessionId={null} reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={props(start)}
      heat={{ "114:1:1": "bg-warn/20" }}
      history={{ "114:1:1": [{ label: "Hifdh: Forgot it", note: null, date: "2026-09-10T00:00:00Z" }] }} />);
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    expect(screen.getByRole("list", { name: "Earlier marks on this word" }).textContent).toContain("Forgot it");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(start).not.toHaveBeenCalled();
  }, SLOW);

  it("Start creates the hearing once with the chosen range, then taps log into it", async () => {
    const start = starter();
    const onStarted = vi.fn();
    render(<ReviewLogger mode="hearing" sessionId={null} reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={{ ...props(start), onStarted }} />);
    fireEvent.click(screen.getByRole("button", { name: "Start hearing" }));
    expect(screen.getByRole("heading", { name: "Hearing Aisha" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "113" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "End hearing" }, { timeout: 10_000 });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ from: 114, to: 113 });
    expect(onStarted).toHaveBeenCalledWith({ id: "h1", from: 114, to: 113 });
    expect(screen.getByText(/An-Nas → Al-Falaq/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/1 mistake/, undefined, { timeout: 10_000 })).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
    expect(logMistake).toHaveBeenCalledWith(
      "h1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
  }, SLOW);

  it("a failed Start keeps the popup open with a message, and a retry starts the hearing", async () => {
    const start = vi.fn()
      .mockRejectedValueOnce(new Error("An error occurred in the Server Components render."))
      .mockImplementation(async (r: { from: number; to: number }) => ({ id: "h1", from: r.from, to: r.to }));
    render(<ReviewLogger mode="hearing" sessionId={null} reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={props(start)} />);
    fireEvent.click(screen.getByRole("button", { name: "Start hearing" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText(
      "Could not start the hearing. Check the connection and try again.",
      undefined, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hearing Aisha" })).toBeTruthy();
    // The open popup hides the bar from the accessibility tree; it is still there.
    expect(screen.getByRole("button", { name: "Start hearing", hidden: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End hearing", hidden: true })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Start" }, { timeout: 10_000 }));
    await screen.findByRole("button", { name: "End hearing" }, { timeout: 10_000 });
    expect(start).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Could not start the hearing/)).toBeNull();
  }, SLOW);

  it("with a session passed in, it opens mid-hearing and ends at the planned end", async () => {
    const start = starter();
    render(<ReviewLogger mode="hearing" sessionId="draft-9" reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={{ ...props(start), plannedTo: 113 }} />);
    expect(screen.queryByRole("button", { name: "Start hearing" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "End hearing" }));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "cleaner than last week" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith(
      "draft-9", { to: 113, passed: [114, 113], note: "cleaner than last week" }));
    expect(start).not.toHaveBeenCalled();
  }, SLOW);

  it("a mark beyond the planned end widens the end", async () => {
    render(<ReviewLogger mode="hearing" sessionId="draft-9" reciterName="Aisha" pages={pages}
      initialMistakes={[mark({ surah_number: 113 })]} hearing={{ ...props(), plannedTo: 114 }} />);
    fireEvent.click(screen.getByRole("button", { name: "End hearing" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith(
      "draft-9", { to: 113, passed: [114, 113], note: "" }));
  }, SLOW);

  it("an unticked surah is not passed", async () => {
    render(<ReviewLogger mode="hearing" sessionId="draft-9" reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={{ ...props(), plannedTo: 114 }} />);
    fireEvent.click(screen.getByRole("button", { name: "End hearing" }));
    fireEvent.click(screen.getByLabelText(/An-Nas/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("draft-9", { to: 114, passed: [], note: "" }));
  }, SLOW);

  /**
   * After Confirm the page refreshes in place, so the logger can outlive the
   * hearing it just submitted. It must go back to before-a-hearing: a tap
   * logs nothing (never into the submitted draft, which RLS rejects) and
   * the next hearing needs its own Start.
   */
  it.each([
    ["a hearing started here", null],
    ["a hearing passed in", "draft-9"],
  ])("after Confirm, it is back to Start hearing and a tap logs nothing (%s)", async (_, sessionId) => {
    const start = starter();
    const onFinished = vi.fn();
    render(<ReviewLogger mode="hearing" sessionId={sessionId} reciterName="Aisha" pages={pages}
      initialMistakes={[]} hearing={{ ...props(start), plannedTo: 114, onFinished }} />);
    if (sessionId === null) await begin(start);
    fireEvent.click(screen.getByRole("button", { name: "End hearing" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const id = sessionId ?? "h1";
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith(id, { to: 114, passed: [114], note: "" }));
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledWith(id));
    await screen.findByRole("button", { name: "Start hearing" }, { timeout: 10_000 });
    expect(screen.queryByRole("button", { name: "End hearing" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(logMistake).not.toHaveBeenCalled();
  }, SLOW);

  it("during a hearing, shows earlier marks for a hot word inside the sheet", () => {
    render(
      <ReviewLogger
        mode="hearing" sessionId="draft-9"
        reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={props()}
        heat={{ "114:1:1": "bg-warn/20" }}
        history={{ "114:1:1": [{ label: "Hifdh: Forgot it", note: null, date: "2026-09-10T00:00:00Z" }] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    expect(screen.getByRole("list", { name: "Earlier marks on this word" }).textContent).toContain("Forgot it");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  }, SLOW);
});
