import { cn } from "@/lib/utils";
import { paceStatus } from "@/lib/hifz/pace";

/** Horizontal surah track: filled to `passed`, notched at `expected`. */
export function PaceMarker({
  passed, expected, target,
}: { passed: number; expected: number; target: number }) {
  const status = paceStatus(passed, expected);
  const ticks = Array.from({ length: target }, (_, i) => i);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-lg tabular-nums">
          {passed} <span className="text-muted-foreground">of {target}</span>
        </span>
        <span className={cn(
          "rounded-md px-2 py-0.5 text-xs font-medium",
          status === "ok" && "bg-ok/12 text-ok",
          status === "warn" && "bg-warn/12 text-warn",
          status === "danger" && "bg-danger/12 text-danger",
        )}>
          {status === "ok" ? "ahead of pace" : status === "warn" ? "on pace" : "behind pace"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-end gap-[3px]">
          {ticks.map((i) => (
            <span
              key={i}
              className={cn(
                "w-1.5 shrink-0 rounded-[1px]",
                i < passed ? "h-5" : "h-3",
                i < passed
                  ? status === "danger" ? "bg-danger" : status === "warn" ? "bg-warn" : "bg-ok"
                  : "bg-line",
                i === expected - 1 && "relative outline outline-1 outline-offset-1 outline-ink",
              )}
            />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Expected by now: <span className="tabular-nums">{expected}</span> surahs
      </p>
    </div>
  );
}
