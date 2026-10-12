// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { VoiceRecorder } from "./voice-recorder";

const storage = vi.hoisted(() => ({
  remove: vi.fn(async () => ({ data: [], error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "blob:x" }, error: null })),
  upload: vi.fn(async () => ({ data: {}, error: null })),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    storage: { from: () => storage },
    auth: { getUser: async () => ({ data: { user: { id: "uid" } } }) },
  }),
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
type FakeRecorder = { ondataavailable: (e: { data: Blob }) => void; onstop: () => void };
let lastRecorder: FakeRecorder | null = null;
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
      constructor() {
        lastRecorder = this as unknown as FakeRecorder;
      }
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

/**
 * A page keeps the server-action ids of the deploy it was loaded from. A
 * release while a student was recording (12 Oct, Qāʿidah 2) let the audio
 * upload and then threw on the save that points the homework at it; every
 * retry from that tab threw the same way. The recorder now says what the
 * form says: the app was updated, reload.
 */
describe("VoiceRecorder — a page older than the deploy", () => {
  beforeEach(() => {
    fakeMicrophone();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("says the app was updated and offers a reload when the save throws", async () => {
    actions.saveVoiceNote.mockRejectedValueOnce(new Error("An unexpected response was received from the server."));
    render(
      <VoiceRecorder submissionId="s1" questionId="q1" attempt={1}
        initialPath={null} initialDuration={null} readOnly={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record my recitation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));
    lastRecorder!.ondataavailable({ data: new Blob(["x"], { type: "audio/webm" }) });
    lastRecorder!.onstop();
    expect(await screen.findByText(/The app was updated/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
    expect(storage.upload).toHaveBeenCalled();
  });

  it("says the same when Record again cannot drop the old recording", async () => {
    actions.deleteVoiceNote.mockRejectedValueOnce(new Error("An unexpected response was received from the server."));
    recorder();
    fireEvent.click(screen.getByRole("button", { name: "Record again" }));
    expect(await screen.findByText(/The app was updated/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("still blames the connection when the site cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    actions.deleteVoiceNote.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    recorder();
    fireEvent.click(screen.getByRole("button", { name: "Record again" }));
    expect(await screen.findByText(/connection/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reload page" })).toBeNull();
  });
});
