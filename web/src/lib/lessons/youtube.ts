/** A YouTube video id is exactly 11 characters of base64url alphabet. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Paths that carry the id as the last segment: /embed/ID, /live/ID, /shorts/ID, youtu.be/ID */
const PATH_RE = /(?:youtu\.be|\/(?:embed|live|shorts|v))\/([A-Za-z0-9_-]{11})/;

/**
 * Teachers paste whatever the YouTube share button gave them — a watch URL, a
 * youtu.be link, a Shorts link, sometimes with a timestamp or playlist hanging
 * off the end. Take all of it and return the bare id, or null if there isn't one.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (ID_RE.test(raw)) return raw;

  // ?v= is the common case; look for it before falling back to path shapes.
  const v = raw.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (v) return v[1];

  const path = raw.match(PATH_RE);
  if (path) return path[1];

  return null;
}

/**
 * Poster frame for a lesson video. No API key, no quota — ytimg serves these
 * straight from Google's CDN.
 *
 * `hqdefault` rather than `maxresdefault`: maxres is true 16:9 but only exists
 * if the source was uploaded in HD, which is not true of every video on the
 * channel, and a 404 on a card is worse than a crop. hqdefault is always
 * present at 480×360 with the 16:9 frame letterboxed inside it — 12.5% bars top
 * and bottom, which `object-cover` in a 16:9 box crops off exactly.
 */
export function thumbnailUrl(youtubeId: string | null): string | null {
  if (!youtubeId) return null;
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}
