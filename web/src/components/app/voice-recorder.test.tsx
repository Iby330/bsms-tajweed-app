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

/** Just enough of a microphone for start() to reach `recorder.start()`. */
const stopTrack = vi.fn();
function fakeMicrophone() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) },
  });
  vi.stubGlobal(
    "MediaRecorder",
    class {
      static isTypeSupported = () => true;
      mimeType = "audio/webm";
      ondataavailable: unknown = null;
      onstop: unknown = null;
      start = vi.fn();
      stop = vi.fn();
    },
  );
}

describe("VoiceRecorder — Record again", () => {
  beforeEach(fakeMicrophone);
  afterEach(() => vi.unstubAllGlobals());

  /** One button, not two: a second recording replaces the first. */
  it("offers no separate Delete", () => {
    recorder();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "Record again" })).toBeTruthy();
  });

  it("drops the old recording, rows first then audio, and starts a new one", async () => {
    const onRecorded = vi.fn();
    recorder(onRecorded);
    fireEvent.click(screen.getByRole("button", { name: "Record again" }));
    expect(await screen.findByRole("button", { name: "Stop recording" })).toBeTruthy();
    expect(actions.deleteVoiceNote).toHaveBeenCalledWith("s1", "q1");
    expect(storage.remove).toHaveBeenCalledWith([PATH]);
    expect(actions.deleteVoiceNote.mock.invocationCallOrder[0])
      .toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
    expect(onRecorded).toHaveBeenCalledWith(false);
  });

  /**
   * A refused delete left the row behind while the UI said it was gone: the
   * submit gate still counted the task as recorded, and the teacher got a
   * recording that 404s because its audio had already been removed. So a
   * refused delete keeps the old recording and records nothing new.
   */
  it("keeps the old recording and says so when the delete is refused", async () => {
    actions.deleteVoiceNote.mockResolvedValueOnce({ ok: false, error: "permission denied" });
    const onRecorded = vi.fn();
    recorder(onRecorded);
    fireEvent.click(screen.getByRole("button", { name: "Record again" }));
    expect(await screen.findByText(/Could not replace your recording/)).toBeTruthy();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Stop recording" })).toBeNull();
    expect(screen.getByRole("button", { name: "Record again" })).toBeTruthy();
  });

  /** No microphone, nothing deleted: the student keeps what they had. */
  it("leaves the old recording alone when the microphone is refused", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("NotAllowedError"));
    recorder();
    fireEvent.click(screen.getByRole("button", { name: "Record again" }));
    expect(await screen.findByText(/No microphone access/)).toBeTruthy();
    expect(actions.deleteVoiceNote).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
