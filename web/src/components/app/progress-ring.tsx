"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ringGeometry } from "@/lib/viz/ring";
import { prefersReducedMotion } from "./use-count-up";

export type RingTone = "ok" | "warn" | "danger" | "ink";

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
  size = 76,
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
  const radius = (size - stroke) / 2;
  const { circumference, offset, pct } = ringGeometry(value, radius);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDrawn(true);
      return;
    }
    // One frame of empty ring first, so the transition has somewhere to start.
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
