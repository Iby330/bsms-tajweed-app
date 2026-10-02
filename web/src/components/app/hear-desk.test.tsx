// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { HearDesk } from "./hear-desk";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push, prefetch: vi.fn() }) }));
vi.mock("@/lib/hifz/hearing-actions", () => ({
  logHearingMistake: vi.fn(async () => "new-id"),
  removeHearingMistake: vi.fn(async () => {}),
}));
import { logHearingMistake, removeHearingMistake } from "@/lib/hifz/hearing-actions";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", glyph: null, isEnd: false, page: 604, line: 12, ...over,
});
const pages = groupIntoPages([w({}), w({ position: 2, text: "أَعُوذُ" })]);
const mark = (over: Partial<MistakeRow>): MistakeRow => ({
  id: "m1", session_id: "day-1", surah_number: 114, ayah_number: 1, word_position: 2,
  category: "hifz", detail: null, note: null, created_at: "2026-10-02T09:00:00Z", ...over,
});

const roster = [
  { id: "s1", name: "Aisha", next: "An-Nas", hasTarget: true },
  { id: "s2", name: "Dawud", next: null, hasTarget: false },
  { id: "s3", name: "Bilal", next: "Al-Falaq", hasTarget: true },
];
const base = {
  roster, studentId: "s1", studentName: "Aisha", initialMistakes: [] as MistakeRow[],
  pages, heat: {}, history: {}, surahNames: {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SLOW = 20_000;

describe("HearDesk", () => {
  it("lists the roster with each student's next surah; no target is disabled", () => {
    render(<HearDesk {...base} />);
    const options = [...(screen.getByLabelText("Student") as HTMLSelectElement).options];
    expect(options.map((o) => o.textContent)).toEqual([
      "Aisha · An-Nas", "Dawud · no target set", "Bilal · Al-Falaq",
    ]);
    expect(options.map((o) => o.disabled)).toEqual([false, true, false]);
  });

  it("choosing a student goes to their Hear tab", () => {
    render(<HearDesk {...base} />);
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s3" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifdh?tab=hear&student=s3");
  });

  it("has no Start, End or Finish, and links the student's page", () => {
    render(<HearDesk {...base} />);
    expect(screen.queryByRole("button", { name: /Start/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /End/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Finish/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Aisha's page/ }).getAttribute("href")).toBe("/teacher/hifdh/s1");
    expect(screen.getByText("0 mistakes marked today")).toBeTruthy();
  });

  it("a tap, a category and Save log the mistake at once for the chosen student", async () => {
    render(<HearDesk {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(logHearingMistake).toHaveBeenCalledWith(
      "s1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
    expect(await screen.findByText("1 mistake marked today", undefined, { timeout: 10_000 })).toBeTruthy();
  }, SLOW);

  it("tapping a word marked today offers Remove, which removes the mark", async () => {
    render(<HearDesk {...base} initialMistakes={[mark({})]} />);
    expect(screen.getByText("1 mistake marked today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /أَعُوذُ/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeHearingMistake).toHaveBeenCalledWith("m1");
    expect(await screen.findByText("0 mistakes marked today", undefined, { timeout: 10_000 })).toBeTruthy();
  }, SLOW);

  it("switching student starts a fresh logger, and taps then go to the new student", async () => {
    const { rerender } = render(<HearDesk {...base} initialMistakes={[mark({})]} />);
    expect(screen.getByText("1 mistake marked today")).toBeTruthy();
    rerender(<HearDesk {...base} studentId="s3" studentName="Bilal" initialMistakes={[]} />);
    expect(screen.getByText("0 mistakes marked today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(logHearingMistake).toHaveBeenCalledWith(
      "s3", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
  }, SLOW);
});
