"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * RTL page turning around the rendered mushaf. The next page (higher
 * number) lies to the LEFT, as in a physical mushaf — the left arrow and a
 * rightward swipe both advance; the right arrow and a leftward swipe go
 * back. Arrows sit mid-height at the sides, like holding the book's edges.
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
      <Button
        size="sm"
        variant="outline"
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2"
        disabled={page + step > max}
        onClick={() => go(page + step)}
        aria-label="Next page"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2"
        disabled={page - step < min}
        onClick={() => go(page - step)}
        aria-label="Previous page"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
