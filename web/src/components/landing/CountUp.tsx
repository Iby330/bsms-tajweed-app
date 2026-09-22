"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * A figure that counts up the first time it is scrolled to.
 *
 * Uses @number-flow/react, which was already a dependency and unused. Worth
 * the import rather than a hand-rolled interval: it animates each DIGIT
 * independently, so the column of numerals rolls instead of the whole value
 * flickering through a hundred renders, and it holds the element's width
 * steady while it does — no reflow of the line beside it.
 *
 * It starts at zero and only moves once visible. A figure that finished
 * counting before the reader arrived is just a number.
 */
export default function CountUp({
  value,
  suffix,
}: {
  value: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Derived, not stored: someone who asked for less motion gets the real
  // number on the first paint, with no state to sync and no second render.
  const shown = reduced || seen ? value : 0;

  return (
    <span ref={ref}>
      {/* The accessible value is the true one from the very first render. The
          count is presentation, and a screen reader should never be told this
          programme has taught zero students. */}
      <span aria-hidden="true">
        <NumberFlow value={shown} willChange />
      </span>
      <span className="lp-sr">{value}</span>
      {suffix}
    </span>
  );
}
