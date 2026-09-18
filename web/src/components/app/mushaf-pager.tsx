"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * RTL page turning around the rendered mushaf. The next page (higher
 * number) lies to the LEFT, as in a physical mushaf — the left arrow and a
 * rightward drag both advance; the right arrow and a leftward drag go
 * back. A trackpad/wheel swipe mirrors the drag: natural scrolling reports
 * two fingers moving right as `deltaX < 0`, and that's the same "pull the
 * page right" gesture, so it advances too (one page per gesture, debounced
 * so a single swipe doesn't skip pages); vertical scrolling is left alone.
 * Arrows sit mid-height, just outside the page's own edges — hugging its
 * box rather than the wider column around it — like holding the book's
 * edges. Below md they sit under the page instead, where they cannot
 * cover the glyphs on a phone. `step` is 2 for a two-page spread. Neighbours are prefetched so a
 * turn feels immediate.
 */
export function MushafPager({
  page,
  min,
  max,
  basePath,
  param = "page",
  step = 1,
  children,
}: {
  page: number;
  min: number;
  max: number;
  basePath: string;   // with or without a query string
  param?: string;     // query key this pager owns
  step?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // basePath may already carry a query (`/hifdh?tab=review`) or be bare
  // (`/hifdh/88`); start the string or extend it accordingly.
  const href = (p: number) => `${basePath}${basePath.includes("?") ? "&" : "?"}${param}=${p}`;
  const go = (p: number) => {
    if (p >= min && p <= max) router.push(href(p), { scroll: false });
  };

  useEffect(() => {
    if (page - step >= min) router.prefetch(href(page - step));
    if (page + step <= max) router.prefetch(href(page + step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, min, max, step, basePath, param]);

  const startX = useRef<number | null>(null);
  // Timestamp of the last wheel-driven turn. A continuous trackpad swipe
  // fires many wheel events; without this one gesture would turn several
  // pages instead of one.
  const lastWheel = useRef(0);
  return (
    <div className="relative w-fit mx-auto">
      <div
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (dx > 48) go(page + step);      // dragged rightward → turn forward
          else if (dx < -48) go(page - step); // dragged leftward → turn back
        }}
        onWheel={(e) => {
          // Only act on a horizontal-dominant gesture — vertical scrolling
          // (including a mostly-vertical swipe) is left untouched.
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
          if (Math.abs(e.deltaX) < 30) return;
          const now = Date.now();
          if (now - lastWheel.current < 600) return;
          lastWheel.current = now;
          // Natural scrolling: two fingers moving right → deltaX < 0, the
          // same "pull the page right" gesture as the rightward drag.
          if (e.deltaX < 0) go(page + step);
          else go(page - step);
        }}
        className="touch-pan-y"
      >
        {children}
      </div>
      {/* On a phone the arrows sit under the page as two plain buttons, so
          they stop covering the glyphs at 390px. From md up the wrapper
          dissolves (display: contents) and they hug the page edges again. */}
      <div className="mt-2 flex justify-between gap-2 md:contents">
        <Button
          size="sm"
          variant="outline"
          className="md:absolute md:-left-11 md:top-1/2 md:z-10 md:-translate-y-1/2"
          disabled={page + step > max}
          onClick={() => go(page + step)}
          aria-label="Next page"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="md:absolute md:-right-11 md:top-1/2 md:z-10 md:-translate-y-1/2"
          disabled={page - step < min}
          onClick={() => go(page - step)}
          aria-label="Previous page"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
