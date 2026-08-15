import type { FlagPattern, Pattern } from "@/lib/hifz/mistakes";

/** The mistake tracker: recurring (category, detail) patterns plus
 *  session-level flags. Pure presentation — aggregation happens in lib. */
export function PatternTracker({ patterns, flags }: { patterns: Pattern[]; flags: FlagPattern[] }) {
  if (!patterns.length && !flags.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Recurring mistakes</h3>
      <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
        {patterns.map((p) => (
          <li key={`${p.category}|${p.detail}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate text-sm">{p.label}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
              {p.total}× · {p.surahs.length} surah{p.surahs.length === 1 ? "" : "s"}
              {p.recent > 0 && (
                <span className="rounded-md bg-warn/12 px-1.5 py-0.5 font-medium text-warn">
                  {p.recent} recent
                </span>
              )}
            </span>
          </li>
        ))}
        {flags.map((f) => (
          <li key={f.flag} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate text-sm">{f.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {f.count} of last {f.ofLast} session{f.ofLast === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
