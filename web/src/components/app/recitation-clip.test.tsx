// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, act } from "@testing-library/react";
import { RecitationClip } from "./recitation-clip";

// jsdom has <audio> but no media pipeline: play() and pause() only log "not
// implemented". Stubbed on the prototype so every element on the page shares
// them, and `mock.contexts` says which element each call was made on.
const play = vi.fn(function (this: HTMLMediaElement) {
  return Promise.resolve();
});
const pause = vi.fn();
const load = vi.fn();

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(load);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  play.mockClear();
  pause.mockClear();
  load.mockClear();
});

const URL_6 = "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/090006.mp3";
const CLIP = { url: URL_6, startMs: 11280, endMs: 12490, label: "Al-Balad 90:6" };

const audioOf = (container: HTMLElement) => container.querySelector("audio")!;

describe("RecitationClip", () => {
  it("renders a play button, the label, and an audio element that loads nothing yet", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    expect(screen.getByRole("button", { name: "Play recitation" })).toBeTruthy();
    expect(screen.getByText("Al-Balad 90:6")).toBeTruthy();
    const audio = audioOf(container);
    expect(audio.getAttribute("preload")).toBe("none");
    expect(audio.getAttribute("src")).toBe(URL_6);
  });

  it("names no reciter anywhere", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    expect(container.textContent).not.toMatch(/husary|husari|khalil|reciter/i);
  });

  it("seeks to the start of the slice and plays", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    expect(audioOf(container).currentTime).toBeCloseTo(11.28);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.contexts[0]).toBe(audioOf(container));
  });

  it("says it is loading until the audio is actually playing, then offers Stop", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    expect(screen.getByRole("button", { name: /Loading/ })).toBeTruthy();
    fireEvent(audioOf(container), new Event("playing"));
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  });

  it("stops once the playhead passes the end of the slice", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    const audio = audioOf(container);
    fireEvent(audio, new Event("playing"));

    audio.currentTime = 12.0;
    fireEvent(audio, new Event("timeupdate"));
    expect(pause).not.toHaveBeenCalled();

    audio.currentTime = 12.5;
    fireEvent(audio, new Event("timeupdate"));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play recitation" })).toBeTruthy();
  });

  it("stops between timeupdates, on the animation-frame guard", async () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    const audio = audioOf(container);
    fireEvent(audio, new Event("playing"));

    // No timeupdate at all: only the frame loop is watching.
    audio.currentTime = 12.49;
    await act(() => new Promise((r) => setTimeout(r, 60)));
    expect(pause).toHaveBeenCalled();
  });

  it("replays from the start of the slice", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    const audio = audioOf(container);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    fireEvent(audio, new Event("playing"));
    audio.currentTime = 12.6;
    fireEvent(audio, new Event("timeupdate"));

    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    expect(audio.currentTime).toBeCloseTo(11.28);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("Stop pauses", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    fireEvent(audioOf(container), new Event("playing"));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play recitation" })).toBeTruthy();
  });

  it("plays a whole file from the top when it has no slice", () => {
    const { container } = render(<RecitationClip clip={{ url: URL_6 }} />);
    const audio = audioOf(container);
    audio.currentTime = 4;
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    expect(audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("says so when the audio cannot be loaded, and can try again", () => {
    const { container } = render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    fireEvent(audioOf(container), new Event("error"));
    expect(
      screen.getByText("Couldn't load the recitation. Check your connection and try again."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    // a failed element is reset before it is asked again
    expect(load).toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("treats a refused play() as a failure, but not an interrupted one", async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException("x", "AbortError")));
    render(<RecitationClip clip={CLIP} />);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    await act(async () => {});
    expect(screen.queryByText(/Couldn't load the recitation/)).toBeNull();
    // and it is not left spinning
    expect(screen.getByRole("button", { name: "Play recitation" })).toBeTruthy();

    play.mockImplementationOnce(() => Promise.reject(new DOMException("x", "NotSupportedError")));
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    await act(async () => {});
    expect(screen.getByText(/Couldn't load the recitation/)).toBeTruthy();
  });

  it("plays one clip at a time: starting one stops the other", () => {
    const { container } = render(
      <>
        <RecitationClip clip={CLIP} />
        <RecitationClip clip={{ url: URL_6, startMs: 0, endMs: 2000 }} />
      </>,
    );
    const [first, second] = Array.from(container.querySelectorAll("audio"));
    const [b1, b2] = screen.getAllByRole("button", { name: "Play recitation" });

    fireEvent.click(b1);
    fireEvent(first, new Event("playing"));
    expect(pause).not.toHaveBeenCalled();

    fireEvent.click(b2);
    expect(pause.mock.contexts).toContain(first);
    expect(pause.mock.contexts).not.toContain(second);
    expect(play.mock.contexts.at(-1)).toBe(second);
  });

  it("stops the audio when it leaves the page", () => {
    const { container, unmount } = render(<RecitationClip clip={CLIP} />);
    const audio = audioOf(container);
    fireEvent.click(screen.getByRole("button", { name: "Play recitation" }));
    fireEvent(audio, new Event("playing"));
    unmount();
    expect(pause.mock.contexts).toContain(audio);
  });

  it("compact: an icon button with the same accessible name", () => {
    render(<RecitationClip clip={CLIP} compact />);
    const b = screen.getByRole("button", { name: "Play recitation" });
    expect(b.textContent?.trim()).toBe("");
  });

  it("compact with a name says which option it plays", () => {
    render(<RecitationClip clip={CLIP} compact name="option 2" />);
    const b = screen.getByRole("button", { name: "Play option 2" });
    fireEvent.click(b);
    expect(screen.getByRole("button", { name: "Loading… option 2" })).toBeTruthy();
  });

  it("the full button is described by the passage it plays", () => {
    render(<RecitationClip clip={{ ...CLIP, label: "Al-Balad 90:6" }} />);
    const b = screen.getByRole("button", { name: "Play recitation" });
    const id = b.getAttribute("aria-describedby");
    expect(id && document.getElementById(id)?.textContent).toBe("Al-Balad 90:6");
  });
});
