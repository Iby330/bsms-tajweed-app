export type RecordingFormat = { mimeType: string; extension: string };

/** Best first. Safari records mp4 only; everything else does opus-in-webm. */
const CANDIDATES: RecordingFormat[] = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/aac", extension: "m4a" },
];

/**
 * Pick a container the browser will actually record in.
 *
 * Takes `MediaRecorder.isTypeSupported` as an argument rather than reaching for
 * the global, so the choice can be tested for every browser without a browser.
 * An empty mimeType is a valid answer — it means "you decide", which is better
 * than handing MediaRecorder a type it will throw on.
 */
export function pickRecordingFormat(
  isTypeSupported: ((type: string) => boolean) | undefined,
): RecordingFormat {
  if (!isTypeSupported) return { mimeType: "", extension: "webm" };
  return (
    CANDIDATES.find((c) => isTypeSupported(c.mimeType)) ?? { mimeType: "", extension: "webm" }
  );
}
