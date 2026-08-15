// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { ReviewLogger } from "./review-logger";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/hifz/review-actions", () => ({
  logMistake: vi.fn(async () => "new-id"),
  removeMistake: vi.fn(async () => {}),
  submitSession: vi.fn(async () => {}),
}));
import { logMistake, submitSession } from "@/lib/hifz/review-actions";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", isEnd: false, page: 604, line: 12, ...over,
});
const pages = groupIntoPages([w({}), w({ position: 2, text: "أَعُوذُ" })]);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ReviewLogger", () => {
  it("logs a tapped word through the sheet and bumps the count", async () => {
    render(<ReviewLogger sessionId="s1" reciterName="Bilal" pages={pages} initialMistakes={[]} />);
    expect(screen.getByText(/0 mistakes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifz" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(logMistake).toHaveBeenCalledWith(
      "s1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
    expect(await screen.findByText(/1 mistake/)).toBeTruthy();
  });
  it("submits flags and note from the wrap-up", async () => {
    render(<ReviewLogger sessionId="s1" reciterName="Bilal" pages={pages} initialMistakes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByLabelText("Weak hifz overall"));
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));
    expect(submitSession).toHaveBeenCalledWith("s1", ["weak_hifz"], "");
  });
});
