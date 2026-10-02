import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Board } from "@/lib/hifz/mistake-board";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/lib/hifz/board-queries", () => ({ boardFor: vi.fn() }));
vi.mock("@/lib/reference/cached", () => ({
  getCachedSurahs: vi.fn(async () => [
    { number: 88, name_en: "Al-Ghashiyah", name_ar: "الغاشية" },
    { number: 87, name_en: "Al-A'la", name_ar: "الأعلى" },
  ]),
  getCachedSurahStartPages: vi.fn(async () => ({ 88: 592, 87: 591 })),
  getCachedSurahWords: vi.fn(async () => []),
  getCachedPageWords: vi.fn(async () => []),
}));

import { MistakeBoard } from "./mistake-board";
import { boardFor } from "@/lib/hifz/board-queries";

const mark = (id: string, session: string, source: "teacher" | "partner") => ({
  id, session_id: session, surah_number: 88, ayah_number: 17, word_position: 2,
  category: "hifz" as const, detail: "forgot", note: null, created_at: "2026-09-10T10:00:00Z", source,
});
const at = (d: number) => `2026-09-${String(d).padStart(2, "0")}T10:00:00Z`;

async function show(board: Board, source: "all" | "teacher" | "partner" = "all", viewer?: "student" | "teacher") {
  vi.mocked(boardFor).mockResolvedValueOnce(board);
  const ui = await MistakeBoard({
    studentId: "adam", source, basePath: "/hifdh", viewer,
    run: [{ number: 88, name_en: "Al-Ghashiyah" }, { number: 87, name_en: "Al-A'la" }],
    surahHref: (n) => `/hifdh/${n}`,
  });
  return render(<div className="field">{ui}</div>);
}

describe("MistakeBoard", () => {
  it("says so plainly when there are no marks at all", async () => {
    await show({ sessions: [], marks: [] });
    expect(screen.getByText("No mistakes marked yet.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Whose marks" })).toBeNull();
  });

  it("names the source that has none, and keeps the switch", async () => {
    await show({ sessions: [{ id: "p", source: "partner", at: at(1) }], marks: [mark("a", "p", "partner")] }, "teacher");
    expect(screen.getByText("No teacher marks yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Teacher" }).getAttribute("aria-current")).toBe("true");
  });

  it("swaps the session chart for a line below three sessions", async () => {
    await show({
      sessions: [{ id: "t", source: "teacher", at: at(1) }, { id: "p", source: "partner", at: at(2) }],
      marks: [mark("a", "t", "teacher"), mark("b", "p", "partner")],
    });
    expect(screen.getByText(/2 sessions so far/)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Mistakes in the last/ })).toBeNull();
  });

  it("on All, counts both sources and says who marked each chip", async () => {
    await show({
      sessions: [
        { id: "t", source: "teacher", at: at(1) },
        { id: "p1", source: "partner", at: at(2) },
        { id: "p2", source: "partner", at: at(3) },
      ],
      marks: [mark("a", "t", "teacher"), mark("b", "p1", "partner"), mark("c", "p2", "partner")],
    });
    expect(screen.getByText(/1 teacher hearing, 2 partner revisions/)).toBeTruthy();
    expect(screen.getByText(/1 teacher, 2 partner/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Mistakes in the last 3 sessions" })).toBeTruthy();
    expect(screen.getByText("Teacher hearing")).toBeTruthy();
    expect(screen.getByText("Partner revision")).toBeTruthy();
  });

  it("speaks to a teacher about their student's run", async () => {
    const board: Board = { sessions: [{ id: "t", source: "teacher", at: at(1) }], marks: [mark("a", "t", "teacher")] };
    await show(board, "all", "teacher");
    expect(screen.getByText(/Any surah on their run/)).toBeTruthy();
  });
});
