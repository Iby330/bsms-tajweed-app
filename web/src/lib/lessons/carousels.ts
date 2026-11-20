import manifest from "./carousels.json";

/** One slide of a lecture's carousel: a short looping video and the still
 *  shown until it plays. Paths are under `public/carousels/`. */
export type CarouselSlide = { video: string; poster: string; seconds: number };

type Entry = { lecture: number; slides: CarouselSlide[] };

/**
 * The Sahaba Stories carousel made for a lecture, or null when it has none.
 *
 * Keyed by the lesson's YouTube id, not its row id: the carousel belongs to
 * the recording, and the id is the one thing the student page, the Resources
 * page and the teacher's page all hold. The JSON is written by
 * `execution/publish_carousel.py`, which also makes the files; do not edit
 * it by hand.
 */
export function carouselFor(youtubeId: string | null | undefined): CarouselSlide[] | null {
  if (!youtubeId) return null;
  const entry = (manifest as Record<string, Entry>)[youtubeId];
  return entry?.slides.length ? entry.slides : null;
}
