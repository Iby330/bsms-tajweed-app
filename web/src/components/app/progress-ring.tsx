"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ringGeometry } from "@/lib/viz/ring";

export type RingTone = "ok" | "warn" | "danger" | "ink";

/**
 * Breathing room between the stroke and the edge of the SVG box.
 *
 * An SVG clips to its own viewport, so a stroke that reaches the boundary has
 * its dark-mode glow sliced off in straight lines — the ring ends up sitting
 * in a visible rectangle. This keeps the halo inside the box.
 */
const GLOW_PAD = 6;

/** Both stroke and text colour: `currentColor` is what the dark-mode glow
 *  in globals.css draws its halo from. */
const TONES: Record<RingTone, string> = {
  ok: "stroke-ok text-ok",
  warn: "stroke-warn text-warn",
  danger: "stroke-danger text-danger",
  ink: "stroke-ink text-ink",
};

/**
 * A percentage as an arc, with whatever the caller wants in the middle.
 *
 * The arc animates from empty on mount by transitioning stroke-dashoffset,
 * which the compositor can handle on its own — no layout, no JS per frame.
 */
export function ProgressRing({
  value,
  size = 84,
  stroke = 7,
  tone = "ok",
  className,
  children,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: RingTone;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = Math.max(1, (size - stroke) / 2 - GLOW_PAD);
  const { circumference, offset, pct } = ringGeometry(value, radius);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    // One frame of empty ring first, so the transition has somewhere to start.
    // Readers who asked for reduced motion get the same jump to the final
    // offset, minus the sweep — globals.css flattens the transition for them.
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={pct === null ? "No marks yet" : `${pct.toFixed(0)}% complete`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/10"
        />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={drawn ? offset : circumference}
            className={cn(
              TONES[tone],
              "data-glow transition-[stroke-dashoffset] duration-1000 ease-out",
            )}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
