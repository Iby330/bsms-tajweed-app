/**
 * Did the browser actually capture what the timer says was recorded? Pure.
 *
 * Some recorders (Safari's webm, 2026-10) hand back an empty file, or one
 * second of audio, after the timer has run for half a minute. Saving that
 * silently left students re-recording over and over and hearing the same
 * one-second clip, with nothing on screen to say why.
 *
 * `decodedSeconds` is the length of the audio as the browser decodes it, or
 * null when it could not be decoded — then only an empty file is refused,
 * because a decoder that can't read a format is no proof the audio is bad.
 */
export function captureProblem(
  size: number,
  timerSeconds: number,
  decodedSeconds: number | null,
): "empty" | "short" | null {
  if (size === 0) return "empty";
  if (decodedSeconds === null || timerSeconds < 3) return null;
  return decodedSeconds < timerSeconds / 2 ? "short" : null;
}
