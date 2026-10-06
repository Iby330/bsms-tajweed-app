// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, within } from "@testing-library/react";
import { HomeworkForm, type ExistingAnswer } from "./homework-form";
import type { StudentQuestion } from "@/lib/homework/logic";

const actions = vi.hoisted(() => ({
  saveAnswer: vi.fn(async () => ({ error: null })),
  submitHomework: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/homework/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("@/lib/voice/actions", () => ({ saveVoiceNote: vi.fn(), deleteVoiceNote: vi.fn() }));

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ALPHABET = ["ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي","ء"];
const PROMPT = "Which letter is being pronounced? Press play, listen, then tap the letter you hear.";

const written = (id: string, position: number): StudentQuestion => ({
  id, position, qtype: "text", prompt: `Written ${position}`, points: 1,
  is_bonus: false, is_task: false, options: null,
});
const letter = (part: string, position: number): StudentQuestion => ({
  id: `l-${part}`, position, qtype: "mcq", prompt: PROMPT, points: 1,
  is_bonus: false, is_task: false,
  options: ALPHABET.map((l, i) => ({ position: i, label: `Option ${i + 1}`, value: l })),
  media: { clip: { url: `/audio/qaidah/hw1-${part}.mp3`, start_ms: 0, end_ms: 4800 } },
});

const PAPER = [written("w1", 1), written("w2", 2), letter("a", 3), letter("b", 4), letter("c", 5)];

const form = (opts: { existing?: ExistingAnswer[]; status?: string; readOnly?: boolean } = {}) =>
  render(
    <HomeworkForm
      submissionId="s1"
      questions={PAPER}
      existing={opts.existing ?? []}
      status={opts.status ?? "draft"}
      readOnly={opts.readOnly ?? false}
    />,
  );

/** The one part a student can see and use right now. */
const visiblePart = () => screen.getByRole("radiogroup");

describe("HomeworkForm: a run of letter questions", () => {
  it("is one question, numbered after the ones before it, not three", () => {
    form();
    expect(screen.getByText("Question 1")).toBeTruthy();
    expect(screen.getByText("Question 2")).toBeTruthy();
    expect(screen.getByText("Question 3")).toBeTruthy();
    expect(screen.queryByText("Question 4")).toBeNull();
    expect(screen.getAllByText(PROMPT)).toHaveLength(1);
    expect(screen.getByText("3 marks")).toBeTruthy();
    expect(screen.getByText("1 mark per letter")).toBeTruthy();
  });

  it("shows one part at a time, each with its own recording", () => {
    const { container } = form();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(visiblePart().getAttribute("aria-label")).toBe("Letters for question 3a");
    expect(screen.getAllByRole("button", { name: "Play recitation" })).toHaveLength(1);
    const srcs = [...container.querySelectorAll("audio")].map((a) => a.getAttribute("src"));
    expect(srcs).toEqual(["/audio/qaidah/hw1-a.mp3", "/audio/qaidah/hw1-b.mp3", "/audio/qaidah/hw1-c.mp3"]);
  });

  it("draws the alphabet as 29 letter tiles, right to left", () => {
    form();
    const tiles = within(visiblePart()).getAllByRole("radio");
    expect(tiles).toHaveLength(29);
    expect(tiles.map((t) => t.textContent)).toEqual(ALPHABET);
    expect(visiblePart().getAttribute("dir")).toBe("rtl");
  });

  it("chooses a letter, and Next and Back move between parts", () => {
    form();
    fireEvent.click(within(visiblePart()).getByRole("radio", { name: "ص" }));
    expect(within(visiblePart()).getByRole("radio", { name: "ص" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("1 of 3 answered")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(visiblePart().getAttribute("aria-label")).toBe("Letters for question 3b");
    expect(within(visiblePart()).getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(visiblePart().getAttribute("aria-label")).toBe("Letters for question 3a");
    expect(within(visiblePart()).getByRole("radio", { name: "ص" }).getAttribute("aria-checked")).toBe("true");
  });

  it("jumps to a part from its square, and says which are answered", () => {
    form();
    fireEvent.click(within(visiblePart()).getByRole("radio", { name: "ق" }));
    fireEvent.click(screen.getByRole("button", { name: "Question 3c" }));
    expect(visiblePart().getAttribute("aria-label")).toBe("Letters for question 3c");
    expect(screen.getByRole("button", { name: "Question 3a, answered" })).toBeTruthy();
  });

  it("can't go back from the first part, and finishes on the last", () => {
    form();
    expect((screen.getByRole("button", { name: "← Back" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Question 3c" }));
    const finish = screen.getByRole("button", { name: "Finish" });
    fireEvent.click(finish);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("keeps hidden parts out of reach: inert and hidden from a screen reader", () => {
    const { container } = form();
    const groups = container.querySelectorAll('[role="radiogroup"]');
    expect(groups).toHaveLength(3);
    const hidden = [...groups].filter((g) => g.closest("[inert]"));
    expect(hidden).toHaveLength(2);
  });

  it("restores a saved letter, and a handed-in paper can't be changed", () => {
    form({
      existing: [{ question_id: "l-a", response: { selected: [13] }, final_marks: null, auto_rubric: null, teacher_comment: null }],
      status: "submitted",
      readOnly: true,
    });
    const chosen = within(visiblePart()).getByRole("radio", { name: "ص" });
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    expect((chosen as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows each part's mark once the paper is approved", () => {
    form({
      existing: [
        { question_id: "l-a", response: { selected: [13] }, final_marks: 1, auto_rubric: null, teacher_comment: null },
        { question_id: "l-b", response: { selected: [2] }, final_marks: 0, auto_rubric: null, teacher_comment: "Listen for the heavy letter." },
      ],
      status: "approved",
      readOnly: true,
    });
    const part = visiblePart().parentElement!;
    expect(within(part).getByText("1/1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Question 3b/ }));
    expect(within(visiblePart().parentElement!).getByText("Listen for the heavy letter.")).toBeTruthy();
  });
});
