// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { VoiceRecorder } from "./voice-recorder";

const storage = vi.hoisted(() => ({
  remove: vi.fn(async () => ({ data: [], error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "blob:x" }, error: null })),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ storage: { from: () => storage } }),
}));
const actions = vi.hoisted(() => ({
  saveVoiceNote: vi.fn(),
  deleteVoiceNote: vi.fn(
    async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}));
vi.mock("@/lib/voice/actions", () => actions);

const PATH = "uid/s1/a1/q1.webm";
const recorder = (onRecorded = vi.fn()) =>
  render(
    <VoiceRecorder submissionId="s1" questionId="q1" attempt={1}
      initialPath={PATH} initialDuration={12} readOnly={false} onRecorded={onRecorded} />,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("VoiceRecorder — Delete", () => {
  it("drops the rows first, then the audio", async () => {
    const onRecorded = vi.fn();
    recorder(onRecorded);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledWith(false));
    expect(actions.deleteVoiceNote).toHaveBeenCalledWith("s1", "q1");
    expect(storage.remove).toHaveBeenCalledWith([PATH]);
    expect(actions.deleteVoiceNote.mock.invocationCallOrder[0])
      .toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
    expect(screen.getByRole("button", { name: "Record my recitation" })).toBeTruthy();
  });

  /**
   * A refused delete left the row behind while the UI said it was gone: the
   * submit gate still counted the task as recorded, and the teacher got a
   * recording that 404s because its audio had already been removed.
   */
  it("keeps the recording and says so when the delete is refused", async () => {
    actions.deleteVoiceNote.mockResolvedValueOnce({ ok: false, error: "permission denied" });
    const onRecorded = vi.fn();
    recorder(onRecorded);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Could not delete this recording/)).toBeTruthy();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Record again" })).toBeTruthy();
  });
});
