export type RecordingFormat = { mimeType: string; extension: string };

/** Best first. Safari used to record mp4 only; everything else does
 *  opus-in-webm. Safari now offers webm too, but its webm recordings come out
 *  empty or cut to under a second (seen on Safari 26, Mac and iPhone), so
 *  Apple's engine is still steered to mp4 — see `preferMp4`. */
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
  { preferMp4 = false }: { preferMp4?: boolean } = {},
): RecordingFormat {
  if (!isTypeSupported) return { mimeType: "", extension: "webm" };
  const order = preferMp4
    ? [...CANDIDATES.filter((c) => c.extension === "m4a"), ...CANDIDATES.filter((c) => c.extension !== "m4a")]
    : CANDIDATES;
  return order.find((c) => isTypeSupported(c.mimeType)) ?? { mimeType: "", extension: "webm" };
}

/** Apple's engine — Safari, and every browser on an iPhone or iPad. */
export function isAppleWebKit(nav: { vendor?: string } | undefined): boolean {
  return (nav?.vendor ?? "").startsWith("Apple");
}
