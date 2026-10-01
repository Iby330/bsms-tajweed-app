// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { ReviewLogger } from "./review-logger";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

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
// A page that also carries the start of the surah before it, the way the
// last page of a run does — used to check the desk proposes the end from
// the page on screen, not from the start surah alone.
const pagesWithNextSurah = groupIntoPages([
  w({}), w({ position: 2, text: "أَعُوذُ" }),
  w({ surah: 113, ayah: 1, position: 1, text: "قُلْ", line: 14 }),
]);

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
  const ensure = () => vi.fn(async () => "h1");
  const hearing = { from: 114, minEnd: 78, names: { 114: { en: "An-Nas", ar: "الناس" } }, passedBefore: {} };

  it("creates the draft on the first tap, then logs into it", async () => {
    const ensureSession = ensure();
    render(
      <ReviewLogger
        mode="hearing" sessionId={null} ensureSession={ensureSession}
        reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing}
      />,
    );
    expect(screen.getByText(/Hearing/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finish" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/1 mistake/, undefined, { timeout: 10_000 })).toBeTruthy();
    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(logMistake).toHaveBeenCalledWith(
      "h1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
  }, SLOW);

  it("finishes through the range popup, creating the draft if needed", async () => {
    const ensureSession = ensure();
    render(<ReviewLogger mode="hearing" sessionId={null} ensureSession={ensureSession}
      reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "cleaner than last week" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("h1", { to: 114, passed: [114], note: "cleaner than last week" }));
    expect(ensureSession).toHaveBeenCalledTimes(1);
  }, SLOW);

  it("an unticked surah is not passed, on an existing draft", async () => {
    render(<ReviewLogger mode="hearing" sessionId="draft-9" ensureSession={ensure()}
      reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByLabelText(/An-Nas/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("draft-9", { to: 114, passed: [], note: "" }));
  }, SLOW);

  /**
   * After Finish the page refreshes in place, so the logger can outlive the
   * hearing it just submitted. The next tap must open a NEW draft, never
   * write into the submitted one (RLS rejects that, and a second Finish
   * then throws "Hearing already submitted or not yours.").
   */
  it.each([
    ["a draft created on Finish", null],
    ["an existing draft", "draft-9"],
  ])("after Finish, the next mark goes to a new draft (%s)", async (_, sessionId) => {
    // A draft made on Finish takes h1; whatever comes after it is h2.
    const ensureSession = vi.fn(async () => "h2");
    if (sessionId === null) ensureSession.mockResolvedValueOnce("h1");
    const session = sessionId === null
      ? { sessionId: null, ensureSession }
      : { sessionId, ensureSession };
    render(<ReviewLogger mode="hearing" {...session}
      reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const first = sessionId ?? "h1";
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith(first, { to: 114, passed: [114], note: "" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 5_000 });

    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(logMistake).toHaveBeenCalledTimes(1));
    expect(logMistake).toHaveBeenCalledWith(
      "h2", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
    expect(await screen.findByText(/1 mistake/, undefined, { timeout: 10_000 })).toBeTruthy();
  }, SLOW);

  it("at the desk, proposes the end from the page on screen (pager), not just the start", async () => {
    const ensureSession = ensure();
    render(
      <ReviewLogger
        mode="hearing" sessionId={null} ensureSession={ensureSession}
        reciterName="Aisha" pages={pagesWithNextSurah} initialMistakes={[]}
        pager={{ page: 604, min: 562, max: 604, basePath: "/teacher/hifdh/hear?student=s1&from=114" }}
        hearing={{ ...hearing, endFromPage: true }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() =>
      expect(submitHearing).toHaveBeenCalledWith("h1", { to: 113, passed: [114, 113], note: "" }));
  }, SLOW);

  it("shows earlier marks for a hot word inside the sheet", () => {
    render(
      <ReviewLogger
        mode="hearing" sessionId="draft-9" ensureSession={ensure()}
        reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing}
        heat={{ "114:1:1": "bg-warn/20" }}
        history={{ "114:1:1": [{ label: "Hifdh: Forgot it", note: null, date: "2026-09-10T00:00:00Z" }] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    expect(screen.getByRole("list", { name: "Earlier marks on this word" }).textContent).toContain("Forgot it");
  }, SLOW);
});
