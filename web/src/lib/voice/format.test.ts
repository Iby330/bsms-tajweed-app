import { describe, expect, it } from "vitest";
import { pickRecordingFormat } from "./format";

describe("pickRecordingFormat", () => {
  it("prefers opus-in-webm when the browser offers it (Chrome, Firefox)", () => {
    const format = pickRecordingFormat(() => true);
    expect(format).toEqual({ mimeType: "audio/webm;codecs=opus", extension: "webm" });
  });

  it("falls back to mp4 on Safari, which has no webm recorder", () => {
    const safari = (type: string) => type.startsWith("audio/mp4");
    expect(pickRecordingFormat(safari)).toEqual({ mimeType: "audio/mp4", extension: "m4a" });
  });

  it("falls back to plain webm when opus isn't advertised", () => {
    const noOpus = (type: string) => type === "audio/webm";
    expect(pickRecordingFormat(noOpus)).toEqual({ mimeType: "audio/webm", extension: "webm" });
  });

  it("lets the browser choose when it claims to support nothing", () => {
    // An empty mimeType tells MediaRecorder to use its own default rather
    // than throwing NotSupportedError.
    expect(pickRecordingFormat(() => false)).toEqual({ mimeType: "", extension: "webm" });
  });

  it("survives a browser with no isTypeSupported at all", () => {
    expect(pickRecordingFormat(undefined)).toEqual({ mimeType: "", extension: "webm" });
  });
});
