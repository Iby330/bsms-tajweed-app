import { cn } from "@/lib/utils";
import { termBar } from "@/lib/viz/term-bars";
import type { TermProgress } from "@/lib/dashboard/queries";

/**
 * The year as three stacked bars — exam contribution beneath homework
 * contribution, summing to the term mark.
 *
 * The current term is outlined rather than filled with a projected figure:
 * a term mark before its exam is not a small mark, it is not a mark yet.
 */
export function TermBars({
  terms,
  currentTermId,
}: {
  terms: TermProgress[];
  currentTermId: number;
}) {
  return (
    <div className="flex items-end justify-around gap-4 sm:gap-8">
      {terms.map((t, i) => {
        const bar = termBar(t);
        const live = t.termId === currentTermId;
        const share = (part: number | null) =>
          bar.total > 0 && part !== null ? `${(part / bar.total) * 100}%` : "0%";

        return (
          <div
            key={t.termId}
            data-term={t.termId}
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <div className="flex h-36 w-full max-w-14 items-end">
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-lg",
                  live && "outline-1 outline-offset-2 outline-foreground/25",
                  bar.total === 0 && "bg-foreground/6",
                )}
                style={{ height: `${Math.max(bar.total, 4)}%` }}
              >
                <div
                  className="anim-grow flex h-full w-full flex-col-reverse"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  {bar.examPart !== null && (
                    <span
                      data-part="exam"
                      className="w-full bg-viz-exam"
                      style={{ height: share(bar.examPart) }}
                    />
                  )}
                  {bar.hwPart !== null && (
                    <span
                      data-part="homework"
                      className="w-full bg-viz-hw"
                      style={{ height: share(bar.hwPart) }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Term {t.termId}
              </div>
              <div className="font-heading text-sm tabular-nums">
                {bar.termPct === null ? (
                  <span className="text-muted-foreground">{live ? "live" : "—"}</span>
                ) : (
                  `${bar.termPct.toFixed(1)}%`
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
