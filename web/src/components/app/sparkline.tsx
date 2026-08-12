import { cn } from "@/lib/utils";
import { sparklinePoints, trendOf } from "@/lib/viz/sparkline";

const TREND_TONE = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-muted-foreground",
} as const;

/**
 * The shape of the last few marks. Renders nothing below two marks — a line
 * through one point is a decoration, not information.
 */
export function Sparkline({
  values,
  width = 112,
  height = 26,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const points = sparklinePoints(values, width, height);
  const trend = trendOf(values);
  const [lastX, lastY] = points.split(" ").at(-1)!.split(",").map(Number);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(TREND_TONE[trend], className)}
      role="img"
      aria-label={`Last ${values.length} marks, trending ${trend}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="data-glow"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" />
    </svg>
  );
}
