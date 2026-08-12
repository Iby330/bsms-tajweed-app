"use client";

import { useEffect, useState } from "react";

/** Does the reader want motion kept to a minimum? Safe on the server. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts from zero to `target` once, on mount.
 *
 * Returns the target immediately when the reader asked for reduced motion, or
 * when there is no animation frame to hang off (server render, tests). A null
 * target passes straight through — a missing mark must never animate up to a
 * zero that looks like a real score.
 */
export function useCountUp(target: number | null, duration = 900): number | null {
  const [value, setValue] = useState<number | null>(target === null ? null : 0);

  useEffect(() => {
    if (target === null || typeof requestAnimationFrame !== "function") {
      // Nothing to animate — settle on the next tick rather than synchronously,
      // which would cascade a second render out of this effect.
      const id = setTimeout(() => setValue(target), 0);
      return () => clearTimeout(id);
    }

    let frame = 0;
    let started: number | null = null;
    const reduced = prefersReducedMotion();
    const step = (now: number) => {
      if (started === null) started = now;
      // Reduced motion still lands on the figure — it just arrives whole,
      // on the first frame, instead of being counted out.
      const t = reduced || duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
      // easeOutCubic — quick off the mark, settling gently on the final digits.
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
