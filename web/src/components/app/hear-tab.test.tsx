import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: vi.fn(), supabaseServer: vi.fn() }));
vi.mock("@/lib/reference/cached", () => ({
  getCachedPageWords: vi.fn(), getCachedSurahs: vi.fn(), getCachedSurahStartPages: vi.fn(),
}));
vi.mock("@/lib/hifz/hearing-queries", () => ({
  hearingMistakesFor: vi.fn(async () => []), hearingsForStudent: vi.fn(), openDraftFor: vi.fn(),
}));
vi.mock("@/lib/hifz/hearing-actions", () => ({ startHearing: vi.fn() }));
vi.mock("@/lib/hifz/roster", () => ({
  rosterWithNext: vi.fn(async () => [
    { id: "mine", name: "Aisha", startSurah: 114, target: 0, passed: 0, run: [], next: null },
  ]),
}));
vi.mock("./review-feedback", () => ({ ReviewFeedback: () => null }));

import { HearTab } from "./hear-tab";
import { notFound } from "next/navigation";

describe("HearTab", () => {
  it("a student not on the teacher's roster is not found", async () => {
    await expect(HearTab({ studentId: "someone-else", studentName: "Zaid" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("a student on the roster with no target still gets the tab", async () => {
    vi.mocked(notFound).mockClear();
    await expect(HearTab({ studentId: "mine", studentName: "Aisha" })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
