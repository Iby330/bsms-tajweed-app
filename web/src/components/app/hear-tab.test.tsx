import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: vi.fn(async () => ({ id: "t1" })) }));
vi.mock("@/lib/reference/cached", () => ({
  getCachedPageWords: vi.fn(), getCachedSurahs: vi.fn(), getCachedSurahStartPages: vi.fn(),
}));
vi.mock("@/lib/hifz/hearing-queries", () => ({
  hearingMistakesFor: vi.fn(async () => []), todaysMarksFor: vi.fn(async () => null),
}));
vi.mock("@/lib/hifz/roster", () => ({
  rosterWithNext: vi.fn(async () => [
    { id: "mine", name: "Aisha", startSurah: 114, target: 0, passed: 0, run: [], next: null },
  ]),
}));
vi.mock("./review-feedback", () => ({ ReviewFeedback: () => null }));
vi.mock("./hear-desk", () => ({ HearDesk: () => null }));

import { HearTab } from "./hear-tab";
import { notFound } from "next/navigation";
import { todaysMarksFor } from "@/lib/hifz/hearing-queries";

describe("HearTab", () => {
  it("a student named in the URL but not on the teacher's roster is not found", async () => {
    await expect(HearTab({ studentParam: "someone-else" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("a named student with no target still gets the tab", async () => {
    vi.mocked(notFound).mockClear();
    await expect(HearTab({ studentParam: "mine" })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
    expect(todaysMarksFor).toHaveBeenCalledWith("t1", "mine");
  });

  it("with nobody named and no target anywhere, it says so rather than choosing", async () => {
    vi.mocked(todaysMarksFor).mockClear();
    await expect(HearTab({})).resolves.toBeTruthy();
    expect(todaysMarksFor).not.toHaveBeenCalled();
  });
});
