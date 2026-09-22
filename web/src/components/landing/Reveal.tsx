"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Rise-and-fade as a section comes into view.
 *
 * This is the move that makes the reference page feel alive, and there is
 * direct evidence of it: a full-page headless capture of that site comes back
 * with its content sections EMPTY, because nothing below the fold has been
 * revealed yet. The animation is not decoration there — it is how the page
 * paints at all.
 *
 * Ours is deliberately smaller than that. The page already snaps a section to
 * the viewport at a time, so each one arrives as a deliberate event; it needs a
 * lift on arrival, not an entrance.
 *
 * ── Two things it must not do ──────────────────────────────────────────────
 * Hide content when JavaScript does not run. The element starts visible in the
 * markup and is only hidden once the observer is attached, so a reader without
 * JS gets the page rather than a blank screen — the failure mode that makes
 * scroll animation notorious.
 *
 * Move at all under `prefers-reduced-motion`. That is handled in CSS rather
 * than here, so the class can be applied freely and the query has the final
 * say in one place.
 */
export default function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Arming here, after mount, is what keeps the no-JS path visible: the
    // hidden state only exists once something is able to un-hide it.
    setArmed(true);

    const io = new IntersectionObserver(
      ([entry]) => {
        // One way only. Re-hiding on scroll-out makes a page feel like it is
        // fighting you when you scroll back up.
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`rv${armed && !shown ? " rv-hidden" : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
