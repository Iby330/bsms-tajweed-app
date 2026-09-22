// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PastAttempts, type PastAttempt } from "./past-attempts";
import type { ReviewQuestion } from "./review-panel";

// The snapshot's recordings are played through VoicePlayback, which signs a
// URL out of the private bucket on mount. There is no Supabase in jsdom.
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "blob:x" }, error: null }),
      }),
    },
  }),
}));

const question = (
  over: Partial<ReviewQuestion> & { id: string; position: number },
): ReviewQuestion => ({
  prompt: "Prompt",
  points: 5,
  qtype: "paragraph",
  is_bonus: false,
  is_task: false,
  options: null,
  ...over,
});

const WRITTEN = question({ id: "q1", position: 1 });
const TASK = question({ id: "q2", position: 2, is_task: true, points: 3 });

/** One superseded attempt, with whatever the two jsonb snapshots held. */
const attempt = (over: Partial<PastAttempt> = {}): PastAttempt => ({
  attempt: 1,
  pct: 45,
  approved_at: "2026-09-01T10:00:00Z",
  approver: "Ustadh X",
  is_late: false,
  answers: [],
  voice_notes: [],
  ...over,
});

const snapshotAnswer = (questionId: string, over: Record<string, unknown> = {}) => ({
  question_id: questionId,
  response: { text: "an answer" },
  final_marks: 4,
  teacher_comment: null,
  ...over,
});

const snapshotVoice = (questionId: string) => ({
  question_id: questionId,
  storage_path: `uid/s1/a1/${questionId}.webm`,
  duration_s: 42,
});

const past = (a: PastAttempt, questions: ReviewQuestion[] = [WRITTEN, TASK]) =>
  render(<PastAttempts attempts={[a]} questions={questions} />);

// Same reason as review-panel.test.tsx: no `globals`, so testing-library never
// registers its own afterEach and renders would pile up in document.body.
afterEach(cleanup);

describe("PastAttempts — recitation tasks", () => {
  // The bug: the snapshot was walked by its answers alone, so a task — which
  // has only ever had a recording — vanished from the superseded attempt.
  it("plays a recording the snapshot kept for a task with no answer row", async () => {
    const { container } = past(attempt({ voice_notes: [snapshotVoice("q2")] }));
    await vi.waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
  });

  it("says so when a task was left unrecorded", () => {
    const { container } = past(attempt({ answers: [snapshotAnswer("q1")] }));
    expect(container.textContent).toContain("Nothing recorded for this task.");
  });

  it("shows a dash and no denominator against a task, which was never marked", () => {
    const { container } = past(attempt({ voice_notes: [snapshotVoice("q2")] }));
    expect(container.textContent).toContain("–");
    expect(container.textContent).not.toContain("/ 3");
  });

  it("still skips an ordinary question the snapshot has no row for", () => {
    const { container } = past(attempt({ voice_notes: [snapshotVoice("q2")] }));
    expect(container.textContent).not.toContain("Q1");
    expect(container.textContent).toContain("Q2");
  });

  it("marks the attempt empty only when both snapshots are", () => {
    const { container } = past(attempt());
    expect(container.textContent).toContain("Nothing recorded on this attempt.");
  });

  it("is not empty when the attempt was nothing but a recitation", () => {
    const { container } = past(attempt({ voice_notes: [snapshotVoice("q2")] }));
    expect(container.textContent).not.toContain("Nothing recorded on this attempt.");
  });
});

describe("PastAttempts — reading the snapshots", () => {
  it("still shows a written answer with its mark and comment", () => {
    const { container } = past(
      attempt({
        answers: [snapshotAnswer("q1", { teacher_comment: "Watch the madd." })],
      }),
    );
    expect(container.textContent).toContain("an answer");
    expect(container.textContent).toContain("4 / 5");
    expect(container.textContent).toContain("Watch the madd.");
  });

  it("survives a snapshot that is not an array at all", () => {
    const { container } = past(
      attempt({ answers: { broken: true }, voice_notes: "nonsense" }),
    );
    expect(container.textContent).toContain("Nothing recorded on this attempt.");
  });

  it("drops snapshot rows that are missing the fields it reads", () => {
    const { container } = past(
      attempt({
        answers: [{ response: { text: "no question id" } }, null, 7],
        voice_notes: [{ question_id: "q2" }, { storage_path: "uid/s1/a1/q2.webm" }],
      }),
    );
    // every row was malformed, so nothing survived parsing — and the component
    // said so rather than throwing the marking page away
    expect(container.textContent).toContain("Nothing recorded on this attempt.");
  });

  it("renders nothing at all when there are no previous attempts", () => {
    const { container } = render(<PastAttempts attempts={[]} questions={[WRITTEN, TASK]} />);
    expect(container.innerHTML).toBe("");
  });

  it("names the attempt, its percentage and who released it", () => {
    const { container } = past(attempt({ answers: [snapshotAnswer("q1")] }));
    // "Sep" or "Sept" depending on the ICU data the runtime was built with —
    // the month's spelling is not what this test is about.
    expect(container.textContent).toMatch(
      /Attempt 1 · 45% · released 1 Sept? by Ustadh X/,
    );
  });
});
