"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import type { CarouselSlide } from "@/lib/lessons/carousels";

/**
 * The lecture's Instagram carousel, under its video: the same slides, swiped
 * the same way.
 *
 * Every slide is a still until it is the one in the middle; only that one is
 * a <video>. A lecture has up to sixteen slides at about a megabyte each, and
 * a page that fetched them all to show one would spend a student's data on
 * slides they may never reach. The stills are lazy too.
 *
 * It starts silent. A browser will not autoplay sound, and a page that made
 * noise under a paused lecture would be wrong anyway. The sound button is a
 * tap, which is the gesture a browser needs before it will unmute.
 */
export function LessonCarousel({ slides }: { slides: CarouselSlide[] }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  // Which slide was paused, not whether one is: moving to another slide
  // then plays it, whatever the last one was left doing.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const paused = pausedAt === active;
  // Off screen the slide stops: a loop nobody is looking at still decodes,
  // and with the sound on it would play under the lecture.
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.35 });
    io.observe(strip);
    return () => io.disconnect();
  }, []);

  // The active slide is whichever sits nearest the middle of the strip, read
  // off the scroll position so a swipe, the arrows and the keyboard all agree.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      let best = 0;
      let bestGap = Infinity;
      Array.from(strip.children).forEach((el, i) => {
        const child = el as HTMLElement;
        const gap = Math.abs(child.offsetLeft + child.offsetWidth / 2 - mid);
        if (gap < bestGap) { best = i; bestGap = gap; }
      });
      setActive(best);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      strip.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Set on the element, not only as a prop: React does not reliably carry
    // `muted` through, and an unmuted autoplay is refused outright.
    video.muted = muted;
    if (onScreen && !paused) {
      // Refused when the browser will not autoplay at all (data saver, low
      // power): the still stays up and a tap plays it.
      video.play().catch(() => setPausedAt(active));
    } else {
      video.pause();
    }
  }, [active, muted, paused, onScreen]);

  const go = useCallback((i: number) => {
    const strip = stripRef.current;
    const child = strip?.children[i] as HTMLElement | undefined;
    if (!strip || !child) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({
      left: child.offsetLeft + child.offsetWidth / 2 - strip.clientWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  const count = slides.length;

  return (
    <section aria-roledescription="carousel" aria-label="The lecture in slides" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-[var(--pad)] max-md:px-[var(--gutter)]">
        <span className="label">The lecture in slides</span>
        <span className="label tabular-nums" aria-live="polite">
          {active + 1} / {count}
        </span>
      </div>

      <div
        ref={stripRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); go(Math.min(active + 1, count - 1)); }
          if (e.key === "ArrowLeft") { e.preventDefault(); go(Math.max(active - 1, 0)); }
        }}
        // The side padding is what lets the first and last slide reach the
        // middle. `--slide` is the slide's width, capped by height as well so
        // a whole 3:4 slide fits a laptop screen with the controls.
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[calc(50%-var(--slide)/2)] [--slide:min(76vw,24rem,54svh)] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => {
          const isActive = i === active;
          return (
            <div
              key={slide.video}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${count}`}
              className={`relative aspect-[3/4] w-[var(--slide)] flex-none snap-center overflow-hidden rounded-lg bg-ink transition-opacity duration-300 ${isActive ? "" : "opacity-45"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a plain
                  file from public/, already at the size it is shown */}
              <img
                src={slide.poster}
                alt=""
                width={720}
                height={960}
                loading={i < 2 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
              {isActive ? (
                <>
                  <video
                    ref={videoRef}
                    key={slide.video}
                    src={slide.video}
                    poster={slide.poster}
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="absolute inset-0 size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPausedAt(paused ? null : active)}
                    aria-label={paused ? "Play this slide" : "Pause this slide"}
                    className="absolute inset-0 grid place-items-center"
                  >
                    {paused && (
                      <span className="grid size-14 place-items-center rounded-full bg-[#00004d]/70 text-[#e5e5ff]">
                        <svg viewBox="0 0 24 24" className="ml-0.5 size-6" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className="absolute inset-0"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 px-[var(--pad)] max-md:px-[var(--gutter)]">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
          className="chip inline-flex min-h-9 items-center gap-2"
        >
          {muted ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
          {muted ? "Sound off" : "Sound on"}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            aria-label="Previous slide"
            className="chip inline-flex min-h-9 items-center disabled:opacity-35"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            disabled={active === count - 1}
            aria-label="Next slide"
            className="chip inline-flex min-h-9 items-center disabled:opacity-35"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
