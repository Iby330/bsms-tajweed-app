"use client";

import { useCountUp } from "./use-count-up";

/**
 * A headline number that counts up once on arrival.
 *
 * Renders `fallback` when there is nothing to show, so a missing mark never
 * animates up to a zero that reads like a real score.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  fallback = "—",
}: {
  value: number | null;
  decimals?: number;
  suffix?: string;
  fallback?: string;
}) {
  const shown = useCountUp(value);
  if (shown === null) return <span className="text-muted-foreground/50">{fallback}</span>;
  return (
    <span className="tabular-nums">
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
