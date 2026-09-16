"use client";

import { useEffect, useState } from "react";

/**
 * Which printed page the reader is looking at: the `page-N` section with
 * the most of itself on screen. Null until the observer reports, and
 * always null where IntersectionObserver does not exist (tests).
 */
export function usePageInView(pageNumbers: readonly number[]): number | null {
  const [page, setPage] = useState<number | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).id.replace("page-", ""));
          ratios.set(n, e.intersectionRatio);
        }
        let best: number | null = null;
        let bestRatio = 0;
        for (const [n, r] of ratios) if (r > bestRatio) { best = n; bestRatio = r; }
        if (best !== null) setPage(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const n of pageNumbers) {
      const el = document.getElementById(`page-${n}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [pageNumbers]);
  return page;
}
