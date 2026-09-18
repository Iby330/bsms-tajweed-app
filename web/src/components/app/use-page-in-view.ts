"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Which printed page the reader is looking at: the `page-N` section — found
 * within `root`, NOT via `document.getElementById` — with the most of
 * itself on screen. Null until the observer reports, and always null where
 * IntersectionObserver does not exist (tests).
 *
 * Scoped to `root` because a screen can render more than one MushafReader
 * at once (e.g. the Review tab's peer logger next to the feedback heat
 * viewer), so two `id="page-604"` sections can coexist in the document —
 * `document.getElementById`/`#id` would nondeterministically pick whichever
 * one is first. The attribute selector `[id="page-N"]` scoped to `root`
 * finds only this reader's copy.
 *
 * `pageNumbers` must be a stable (memoised) reference — a new array every
 * render tears down and recreates the observer on every render.
 */
export function usePageInView(root: RefObject<HTMLElement | null>, pageNumbers: readonly number[]): number | null {
  const [page, setPage] = useState<number | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (!root.current) return;
    const container = root.current;
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
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const n of pageNumbers) {
      const el = container.querySelector(`[id="page-${n}"]`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [root, pageNumbers]);
  return page;
}
