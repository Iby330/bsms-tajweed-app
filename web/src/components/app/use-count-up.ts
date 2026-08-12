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
    if (target === null) {
      setValue(null);
      return;
    }
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }

    let frame = 0;
    let started: number | null = null;
    const step = (now: number) => {
      if (started === null) started = now;
      const t = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
      // easeOutCubic — quick off the mark, settling gently on the final digits.
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
