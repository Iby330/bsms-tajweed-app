/**
 * `next` arrives from a query string, which is to say from anywhere, so it is
 * only ever followed when it is a path on this site.
 *
 * "Starts with / and not //" is not enough on its own: browsers read `\` as
 * `/` in a URL, so `/\evil.com` is protocol-relative and leaves the site, and
 * the URL parser silently drops tabs and newlines, so `/\t/evil.com` collapses
 * into `//evil.com`. Those are refused outright, and the parse against a dummy
 * origin is the backstop for whatever else a browser might normalise.
 */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  if (/[\x00-\x1f\x7f]/.test(next)) return fallback;
  try {
    if (new URL(next, "http://x").origin !== "http://x") return fallback;
  } catch {
    return fallback;
  }
  return next;
}
