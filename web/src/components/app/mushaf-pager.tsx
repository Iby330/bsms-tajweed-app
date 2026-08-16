"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * RTL page turning around one rendered mushaf page. The next page (higher
 * number) lies to the LEFT, as in a physical mushaf — the left arrow and a
 * rightward swipe both advance; the right arrow and a leftward swipe go
 * back. Neighbouring pages are prefetched so a turn feels immediate.
 */
export function MushafPager({
  page,
  min,
  max,
  basePath,
  param = "page",
  children,
}: {
  page: number;
  min: number;
  max: number;
  basePath: string;   // already carries its ?tab=… query
  param?: string;     // query key this pager owns
  children: React.ReactNode;
}) {
  const router = useRouter();
  const href = (p: number) => `${basePath}&${param}=${p}`;
  const go = (p: number) => {
    if (p >= min && p <= max) router.push(href(p), { scroll: false });
  };

  useEffect(() => {
    if (page > min) router.prefetch(href(page - 1));
    if (page < max) router.prefetch(href(page + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, min, max, basePath, param]);

  const startX = useRef<number | null>(null);
  return (
    <div className="relative">
      <div
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (dx > 48) go(page + 1);      // dragged rightward → turn forward
          else if (dx < -48) go(page - 1); // dragged leftward → turn back
        }}
        className="touch-pan-y"
      >
        {children}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Button size="sm" variant="outline" disabled={page >= max}
          onClick={() => go(page + 1)} aria-label="Next page">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">{page}</span>
        <Button size="sm" variant="outline" disabled={page <= min}
          onClick={() => go(page - 1)} aria-label="Previous page">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
