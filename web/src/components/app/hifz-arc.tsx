import { cn } from "@/lib/utils";
import { paceStatus } from "@/lib/hifz/pace";
import { journeyNodes } from "@/lib/viz/journey";

const W = 300;
const H = 60;

const TONE = {
  ok: { stroke: "stroke-ok", fill: "fill-ok", pill: "bg-ok/12 text-ok", word: "ahead of pace" },
  warn: { stroke: "stroke-warn", fill: "fill-warn", pill: "bg-warn/12 text-warn", word: "on pace" },
  danger: {
    stroke: "stroke-danger",
    fill: "fill-danger",
    pill: "bg-danger/12 text-danger",
    word: "behind pace",
  },
} as const;

/**
 * The memorisation list as a road: passed surahs lit along a curve, the
 * student's position at the head of the lit stretch, and the pace marker
 * placed on the same road so "behind" is a distance rather than a word.
 *
 * The full list with names and teacher comments lives on /hifz — this is the
 * glance version for Home.
 */
export function HifzArc({
  passed,
  expected,
  target,
}: {
  passed: number;
  expected: number;
  target: number;
}) {
  const nodes = journeyNodes(target, W, H);
  if (nodes.length === 0) return null;

  const status = paceStatus(passed, expected);
  const tone = TONE[status];
  const done = Math.max(0, Math.min(passed, target));
  const walked = nodes.slice(0, done);
  // The marker sits on the surah the student should be *at*, so index expected-1.
  const paceIdx = expected > 0 ? Math.min(expected, target) - 1 : -1;
  const pace = paceIdx >= 0 ? nodes[paceIdx] : null;
  const here = done > 0 ? nodes[done - 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-lg tabular-nums">
          {passed} <span className="text-muted-foreground">of {target}</span>
        </span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tone.pill)}>
          {tone.word}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${passed} of ${target} surahs passed, ${expected} expected by now`}
      >
        <polyline
          points={nodes.map((n) => `${n.x},${n.y}`).join(" ")}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-foreground/12"
        />
        {walked.length > 1 && (
          <polyline
            points={walked.map((n) => `${n.x},${n.y}`).join(" ")}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className={cn(tone.stroke, "data-glow")}
          />
        )}

        {pace && (
          <circle
            data-pace
            cx={pace.x}
            cy={pace.y}
            r={5}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="2 2"
            className="stroke-foreground/45"
          />
        )}

        {nodes.map((n, i) => (
          <circle
            key={i}
            data-node={i < done ? "done" : "todo"}
            cx={n.x}
            cy={n.y}
            r={i < done ? 3.5 : 2.5}
            className={i < done ? tone.fill : "fill-foreground/20"}
          />
        ))}

        {here && (
          <circle data-here cx={here.x} cy={here.y} r={5} className="fill-foreground data-glow" />
        )}
      </svg>

      <p className="text-xs text-muted-foreground">
        Expected by now: <span className="tabular-nums">{expected}</span> surahs
      </p>
    </div>
  );
}
