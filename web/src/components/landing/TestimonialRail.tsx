"use client";

import { useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

export type Testimonial = {
  name: string;
  detail: string;
  line: string;
  src: string;
  poster: string;
};

/**
 * The testimonial videos, as a sideways rail that snaps a card into place.
 *
 * On a phone this is the whole point: one video fills the width with the next
 * one peeking in from the edge, which says "swipe" without a word of
 * instruction. On a desktop three sit side by side and the arrows do the
 * moving, because a mouse has no sideways swipe.
 *
 * Only one video plays at a time. Starting a second pauses the first — two
 * students talking over each other is the failure, not a feature.
 *
 * The captions are burned into the footage by whoever edited it, so the
 * videos read with the sound off and need no separate caption track.
 */
export default function TestimonialRail({
  items,
  aside,
}: {
  items: readonly Testimonial[];
  /** Shares the arrows' row, on the left — where the page puts its ask. */
  aside?: ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function onScroll() {
    const el = rail.current;
    if (!el) return;
    /* A pixel of slack either side: snapping lands on fractional offsets. */
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  function step(dir: 1 | -1) {
    const el = rail.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({
      left: dir * (card.offsetWidth + gap),
      behavior: reduced ? "auto" : "smooth",
    });
  }

  function onPlay(e: SyntheticEvent<HTMLVideoElement>) {
    rail.current?.querySelectorAll("video").forEach((v) => {
      if (v !== e.currentTarget) v.pause();
    });
  }

  return (
    <div className="lp-rail-wrap">
      <div
        ref={rail}
        id="lp-rail"
        className="lp-rail"
        role="region"
        aria-label="Student testimonial videos"
        tabIndex={0}
        onScroll={onScroll}
      >
        {items.map((t) => (
          <figure key={t.src} className="lp-vid">
            <video
              className="lp-vid-player"
              src={t.src}
              poster={t.poster}
              controls
              preload="none"
              playsInline
              onPlay={onPlay}
            />
            <figcaption>
              <strong>{t.line}</strong>
              <span className="lp-muted">
                {t.name} · {t.detail}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="lp-rail-nav">
        {aside}
        <div className="lp-rail-arrows">
        <button
          type="button"
          className="lp-rail-btn"
          aria-label="Previous video"
          aria-controls="lp-rail"
          disabled={atStart}
          onClick={() => step(-1)}
        >
          ←
        </button>
        <button
          type="button"
          className="lp-rail-btn"
          aria-label="Next video"
          aria-controls="lp-rail"
          disabled={atEnd}
          onClick={() => step(1)}
        >
          →
        </button>
        </div>
      </div>
    </div>
  );
}
