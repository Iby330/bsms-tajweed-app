// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, within } from "@testing-library/react";
import { HomeworkForm } from "./homework-form";
import type { StudentQuestion } from "@/lib/homework/logic";

// The form is what's under test: not the server actions, the router, or the
// recorder's Supabase calls.
const actions = vi.hoisted(() => ({
  saveAnswer: vi.fn(async () => undefined),
  submitHomework: vi.fn(async () => undefined),
}));
vi.mock("@/lib/homework/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("@/lib/voice/actions", () => ({ saveVoiceNote: vi.fn(), deleteVoiceNote: vi.fn() }));

const play = vi.fn(() => Promise.resolve());
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  play.mockClear();
  actions.saveAnswer.mockClear();
});

const URL_6 = "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/090006.mp3";
const URL_5 = "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/047005.mp3";

const question = (over: Partial<StudentQuestion>): StudentQuestion => ({
  id: "q1",
  position: 1,
  qtype: "mcq",
  prompt: "Listen to this recitation of Al-Balad 90:6. Which rule do you hear?",
  points: 1,
  is_bonus: false,
  is_task: false,
  options: [
    { position: 1, label: "Option 1", value: "Ikhfa'" },
    { position: 2, label: "Option 2", value: "Idgham" },
  ],
  ...over,
});

const form = (questions: StudentQuestion[]) =>
  render(
    <HomeworkForm
      submissionId="s1"
      questions={questions}
      existing={[]}
      status="draft"
      readOnly={false}
    />,
  );

describe("HomeworkForm: a listening question", () => {
  it("puts the clip player between the prompt and the options", () => {
    const { container } = form([
      question({
        media: { clip: { url: URL_6, start_ms: 3590, end_ms: 6200, label: "Al-Balad 90:6" } },
      }),
    ]);
    const button = screen.getByRole("button", { name: "Play recitation" });
    const prompt = screen.getByText(/Which rule do you hear/);
    const firstOption = container.querySelector('input[type="radio"]')!;
    expect(prompt.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(firstOption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(URL_6);
  });

  it("plays the slice from its start", () => {
    const { container } = form([
      question({ media: { clip: { url: URL_6, start_ms: 3590, end_ms: 6200 } } }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    expect(container.querySelector("audio")!.currentTime).toBeCloseTo(3.59);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shows no player without media, or with media that does not parse", () => {
    form([
      question({ id: "a", media: undefined }),
      question({ id: "b", media: null }),
      question({ id: "c", media: { clip: { url: "http://insecure/1.mp3", start_ms: 0, end_ms: 9 } } }),
      question({ id: "d", media: "junk" }),
    ]);
    expect(screen.queryByRole("button", { name: "Play recitation" })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(8);
  });
});

describe("HomeworkForm: audio on the options", () => {
  const media = { option_audio: { "1": { url: URL_5 }, "2": { url: URL_6, start_ms: 0, end_ms: 4000 } } };

  it("gives each option with audio its own play button", () => {
    const { container } = form([question({ media })]);
    const rows = container.querySelectorAll("li");
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: "Play option 1" })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByRole("button", { name: "Play option 2" })).toBeTruthy();
  });

  it("only the options that have audio get a button", () => {
    form([question({ media: { option_audio: { "2": { url: URL_6 } } } })]);
    expect(screen.getAllByRole("button", { name: /^Play option/ })).toHaveLength(1);
  });

  it("pressing an option's play button does not choose that option", () => {
    const { container } = form([question({ media })]);
    const row = container.querySelectorAll("li")[0] as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Play option 1" }));

    expect(play).toHaveBeenCalledTimes(1);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.every((r) => !r.checked)).toBe(true);
    expect(actions.saveAnswer).not.toHaveBeenCalled();
  });

  it("nor ticks a checkbox", () => {
    const { container } = form([question({ qtype: "checkbox", media })]);
    const row = container.querySelectorAll("li")[1] as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Play option 2" }));

    expect(play).toHaveBeenCalledTimes(1);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => !b.checked)).toBe(true);
  });

  it("choosing the option itself still works beside it", () => {
    const { container } = form([question({ media })]);
    const row = container.querySelectorAll("li")[1] as HTMLElement;
    fireEvent.click(within(row).getByRole("radio"));
    expect((within(row).getByRole("radio") as HTMLInputElement).checked).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });
});
