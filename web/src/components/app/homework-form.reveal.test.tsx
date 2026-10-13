// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HomeworkForm } from "./homework-form";
import type { StudentQuestion } from "@/lib/homework/logic";

vi.mock("@/lib/homework/actions", () => ({ saveAnswer: vi.fn(), submitHomework: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("@/lib/voice/actions", () => ({ saveVoiceNote: vi.fn(), deleteVoiceNote: vi.fn() }));
afterEach(cleanup);

const WORDS = ["إِنَّ", "رَبَّكَ", "لَبِٱلْمِرْصَادِ", "فَأَمَّا", "ٱلْإِنسَـٰنُ", "إِذَا"];

/** HW2 Q8's shape: words of a passage, the ghunna ones keyed — or, before
 *  release, the same words with the key left off by the database. */
const tap = (keyed: boolean): StudentQuestion => ({
  id: "q8", position: 1, qtype: "checkbox", prompt: "Tap the ghunna.", points: 5,
  is_bonus: false, is_task: false,
  options: WORDS.map((w, i) => ({
    position: i, label: `89:14:${i + 1}`, value: w,
    ...(keyed ? { correct: i === 0 || i === 3 } : {}),
  })),
});

const form = (status: string, keyed: boolean) =>
  render(
    <HomeworkForm
      submissionId="s1"
      questions={[tap(keyed)]}
      existing={[{ question_id: "q8", response: { selected: [0] }, final_marks: 2, auto_rubric: null, teacher_comment: null } as never]}
      status={status}
      readOnly
    />,
  );

describe("HomeworkForm: a returned tap-the-words answer", () => {
  it("shows the student what they missed once the paper is released", () => {
    form("approved", true);
    expect(screen.getByText("missed")).toBeTruthy();
  });

  it("shows only their own taps while the paper is still being marked", () => {
    form("submitted", false);
    expect(screen.queryByText("missed")).toBeNull();
    expect(screen.getByText("1 word tapped.")).toBeTruthy();
  });

  it("never draws a marked view without a key to draw it from", () => {
    form("approved", false);
    expect(screen.queryByText("missed")).toBeNull();
  });
});
