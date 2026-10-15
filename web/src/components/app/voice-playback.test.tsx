// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const sign = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ storage: { from: () => ({ createSignedUrl: sign }) } }),
}));
import { VoicePlayback } from "./voice-playback";

afterEach(() => {
  cleanup();
  sign.mockReset();
});
const ok = { data: { signedUrl: "https://x/a.webm" }, error: null };
const no = { data: null, error: new Error("refused") };

describe("VoicePlayback", () => {
  it("plays once the link is signed", async () => {
    sign.mockResolvedValue(ok);
    const { container } = render(<VoicePlayback storagePath="p" durationS={31} />);
    await vi.waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect(screen.getByText("Recording · 0:31")).toBeTruthy();
  });

  it("tries again when the first signing fails, rather than giving up", async () => {
    sign.mockResolvedValueOnce(no).mockResolvedValueOnce(ok);
    const { container } = render(<VoicePlayback storagePath="p" durationS={null} />);
    await vi.waitFor(() => expect(container.querySelector("audio")).not.toBeNull(), { timeout: 3000 });
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("offers Try again after every attempt fails, and it works", async () => {
    sign.mockResolvedValue(no);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<VoicePlayback storagePath="p" durationS={null} />);
    await vi.waitFor(() => expect(screen.getByText("This recording could not be loaded.")).toBeTruthy(), { timeout: 5000 });
    sign.mockResolvedValue(ok);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
  });

  it("says when the device cannot play the audio", async () => {
    sign.mockResolvedValue(ok);
    const { container } = render(<VoicePlayback storagePath="p" durationS={null} />);
    await vi.waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    fireEvent.error(container.querySelector("audio")!);
    expect(screen.getByText(/could not play the recording/)).toBeTruthy();
  });
});
