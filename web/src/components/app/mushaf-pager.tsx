"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * RTL page turning around the rendered mushaf. The next page (higher
 * number) lies to the LEFT, as in a physical mushaf — the left arrow and a
 * rightward swipe both advance; the right arrow and a leftward swipe go
 * back. From md up the arrows sit mid-height at the sides, like holding the
 * book's edges; on a phone they would cover the text, so they sit in a row
 * under the page instead.
 * `step` is 2 for a two-page spread. Neighbours are prefetched so a turn
 * feels immediate.
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
  basePath: string;   // already carries its ?tab=… query
  param?: string;     // query key this pager owns
  step?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const href = (p: number) => `${basePath}&${param}=${p}`;
  const go = (p: number) => {
    if (p >= min && p <= max) router.push(href(p), { scroll: false });
  };

  useEffect(() => {
    if (page - step >= min) router.prefetch(href(page - step));
    if (page + step <= max) router.prefetch(href(page + step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, min, max, step, basePath, param]);

  const startX = useRef<number | null>(null);
  return (
    <div className="relative">
      <div
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (dx > 48) go(page + step);      // dragged rightward → turn forward
          else if (dx < -48) go(page - step); // dragged leftward → turn back
        }}
        className="touch-pan-y"
      >
        {children}
      </div>
      {/* md:contents dissolves this row, so from md up the arrows position
          against the relative wrapper exactly as before. */}
      <div className="mt-2 flex justify-between gap-2 md:contents">
      <Button
        size="sm"
        variant="outline"
        className="md:absolute md:left-0 md:top-1/2 md:z-10 md:-translate-y-1/2"
        disabled={page + step > max}
        onClick={() => go(page + step)}
        aria-label="Next page"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="md:absolute md:right-0 md:top-1/2 md:z-10 md:-translate-y-1/2"
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
