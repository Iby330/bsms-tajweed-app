/**
 * Storage refusals, in words a student can act on.
 *
 * The bucket enforces a size cap and an audio-only mime list, and says so in
 * the language of an object store ("exceeded the maximum allowed size"), which
 * tells a fifteen-year-old nothing about what to do next. Returns null for
 * anything unrecognised so the underlying message still reaches the screen.
 */
export function uploadErrorMessage(message: string): string | null {
  if (/\b413\b|payload too large|size/i.test(message)) {
    return "That recording is too big. Keep it under 25 MB.";
  }
  if (/mime|content.?type/i.test(message)) {
    return "That recording format isn't accepted.";
  }
  return null;
}
