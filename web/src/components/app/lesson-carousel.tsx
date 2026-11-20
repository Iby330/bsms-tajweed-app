"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import type { CarouselSlide } from "@/lib/lessons/carousels";

/**
 * The lecture's Instagram carousel, under its video: the same slides, swiped
 * the same way.
 *
 * Laid out as Instagram lays out a post: one slide at a time, the arrows,
 * the count and the sound button on the slide itself. Underneath is a
 * playhead for the whole carousel: a segment per slide that fills as it
 * plays, pressed or dragged to go to any slide at any moment in it. It
 * moves by swipe on a phone or trackpad, by drag with a mouse, by the arrows
 * on either, and by the arrow keys.
 *
 * Every slide is a still until it is the one showing; only that one is a
 * <video>. A lecture has up to sixteen slides at about a megabyte each, and
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
  // The playhead's own state, in one object so the frame loop, the effect
  // and the handlers share it without a render: whether it is being dragged,
  // and where in a slide a seek landed, kept until that slide's video exists.
  const scrubRef = useRef<{ on: boolean; seek: { index: number; frac: number } | null }>({ on: false, seek: null });
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

  // The active slide is read off the scroll position, so a swipe, a drag,
  // the arrows and the keyboard all agree. One slide fills the strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (strip.clientWidth) setActive(Math.round(strip.scrollLeft / strip.clientWidth));
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
    // A seek from the playhead that landed on this slide before its video
    // existed. Set before the file has loaded, it is where playback starts.
    if (scrubRef.current.seek?.index === active) {
      video.currentTime = scrubRef.current.seek.frac * slides[active].seconds;
      if (!scrubRef.current.on) scrubRef.current.seek = null;
    }
    if (onScreen && !paused) {
      // Refused when the browser will not autoplay at all (data saver, low
      // power): the still stays up and a tap plays it.
      video.play().catch(() => setPausedAt(active));
    } else {
      video.pause();
    }
  }, [active, muted, paused, onScreen, slides]);

  const count = slides.length;

  const go = useCallback((i: number, instant = false) => {
    const strip = stripRef.current;
    if (!strip) return;
    const to = Math.max(0, Math.min(i, count - 1));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: to * strip.clientWidth, behavior: instant || reduce ? "auto" : "smooth" });
  }, [count]);

  // The playhead: one bar for the whole carousel, a segment per slide. It
  // fills as the slide plays, and pressing or dragging along it goes to that
  // slide at that moment. Drawn straight onto the elements every frame: a
  // state update sixty times a second would re-render every slide.
  const barRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const video = videoRef.current;
      const pending = scrubRef.current.seek;
      const frac =
        pending?.index === active
          ? pending.frac
          : video && video.duration > 0
            ? Math.min(video.currentTime / video.duration, 1)
            : 0;
      fillRefs.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleX(${i < active ? 1 : i === active ? frac : 0})`;
      });
      if (knobRef.current) knobRef.current.style.left = `${((active + frac) / count) * 100}%`;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, count]);

  const scrubTo = (clientX: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const box = bar.getBoundingClientRect();
    const at = Math.max(0, Math.min((clientX - box.left) / box.width, 0.9999)) * count;
    const index = Math.floor(at);
    const frac = at - index;
    scrubRef.current.seek = { index, frac };
    if (index !== active) {
      go(index, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = frac * slides[index].seconds;
    }
  };

  // A mouse cannot swipe a scroller, so on a computer the slide is dragged.
  // Touch and trackpads scroll the strip themselves and never come here.
  const drag = useRef<{ x: number; left: number; from: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, from: active, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      // Captured only once it is a drag: capturing on press would take the
      // click away from the buttons on the slide.
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.scrollSnapType = "none";
    }
    if (d.moved) e.currentTarget.scrollLeft = d.left - dx;
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    // The click that ends a drag follows at once, if the browser sends one
    // at all; a flag left up would swallow the student's next real tap.
    dragged.current = true;
    setTimeout(() => { dragged.current = false; }, 0);
    const strip = e.currentTarget;
    const dx = e.clientX - d.x;
    go(d.from + (Math.abs(dx) > 40 ? (dx < 0 ? 1 : -1) : 0));
    // Snapping comes back once the glide has landed; sooner and it jumps.
    setTimeout(() => { strip.style.scrollSnapType = ""; }, 450);
  };

  const arrow =
    "absolute top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[#00004d] shadow-[0_1px_4px_rgba(0,0,32,.35)] transition-opacity hover:bg-white";

  return (
    <section aria-roledescription="carousel" aria-label="The lecture in slides" className="flex w-full flex-col items-center gap-3">
      <span className="label self-start px-[var(--pad)] max-md:px-[var(--gutter)]">The lecture in slides</span>

      {/* One slide at a time, as the post is: full width on a phone, and on a
          computer capped by height too, so a whole 3:4 slide fits the screen. */}
      <div className="relative w-[min(100%,27rem,64svh)] overflow-hidden md:rounded-lg">
        <div
          ref={stripRef}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={(e) => {
            // The click that ends a drag is not a tap on the slide.
            if (dragged.current) { dragged.current = false; e.stopPropagation(); e.preventDefault(); }
          }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, i) => {
            const isActive = i === active;
            return (
              <div
                key={slide.video}
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${i + 1} of ${count}`}
                className="relative aspect-[3/4] w-full flex-none snap-center snap-always bg-ink"
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
                  className="absolute inset-0 size-full select-none object-cover"
                />
                {isActive && (
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
                )}
              </div>
            );
          })}
        </div>

        {/* Shown on arriving at a slide, then gone, as on the post: the
            slides carry their own text in that corner. Keyed so it comes back
            on every slide; the dots below say the same thing all the time. */}
        <span
          key={active}
          className="carousel-count pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-[#00004d]/70 px-2.5 py-1 text-xs tabular-nums text-[#e5e5ff]"
          aria-live="polite"
        >
          {active + 1}/{count}
        </span>

        {active > 0 && (
          <button type="button" onClick={() => go(active - 1)} aria-label="Previous slide" className={`${arrow} left-2.5`}>
            <ChevronLeft className="size-5 -translate-x-px" aria-hidden />
          </button>
        )}
        {active < count - 1 && (
          <button type="button" onClick={() => go(active + 1)} aria-label="Next slide" className={`${arrow} right-2.5`}>
            <ChevronRight className="size-5 translate-x-px" aria-hidden />
          </button>
        )}

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="absolute bottom-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-[#00004d]/70 text-[#e5e5ff]"
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        </button>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Position in the carousel"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={active + 1}
        aria-valuetext={`Slide ${active + 1} of ${count}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubRef.current.on = true;
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => { if (scrubRef.current.on) scrubTo(e.clientX); }}
        onPointerUp={() => {
          scrubRef.current.on = false;
          // Still held for a slide whose video has not mounted yet.
          if (scrubRef.current.seek?.index === active && videoRef.current) scrubRef.current.seek = null;
        }}
        onPointerCancel={() => { scrubRef.current.on = false; scrubRef.current.seek = null; }}
        // Taller than the track it draws, so a thumb can find it; and it owns
        // its touches, or a drag along it would scroll the page instead.
        className="relative flex h-7 w-[min(100%,27rem,64svh)] cursor-pointer touch-none items-center gap-[3px] max-md:px-[var(--gutter)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
      >
        {/* Measured for seeking: the track itself, inside the phone's gutter. */}
        <div ref={barRef} className="relative flex h-full flex-1 items-center gap-[3px]">
          {slides.map((slide, i) => (
            <span key={slide.video} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--hair)]">
              <span
                ref={(el) => { fillRefs.current[i] = el; }}
                className="block size-full origin-left bg-[var(--brand)]"
                style={{ transform: "scaleX(0)" }}
              />
            </span>
          ))}
          <span
            ref={knobRef}
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand)] shadow-[0_0_0_2px_var(--card)]"
            style={{ left: 0 }}
          />
        </div>
      </div>
    </section>
  );
}
