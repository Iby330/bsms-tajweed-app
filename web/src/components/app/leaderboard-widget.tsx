import { cn } from "@/lib/utils";

export type LbRow = {
  name: string;
  pct: number;
  rank: number;
  /** Shown instead of the percentage where a figure is not the useful thing.
   *  On the hifdh board that is the surah the student is actually on: "62% of
   *  target" tells a teacher far less than "Al-Fajr". */
  note?: string;
};

/**
 * Exactly three rows: above, you, below — never a full table (plan Q11).
 *
 * At the ends the window slides back inside the list rather than being
 * clipped. Centring blindly hands two rows to whoever is first or last, and
 * a three-row board then hides its third row behind a "See all 3" button —
 * more work for the reader than simply showing it. Top of the table now
 * reads "you and the two below"; bottom, "the two above and you".
 */
export function neighbours(rows: LbRow[], selfName: string): LbRow[] {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const i = sorted.findIndex((r) => r.name === selfName);
  if (i === -1) return sorted.slice(0, 3);
  const start = Math.min(Math.max(0, i - 1), Math.max(0, sorted.length - 3));
  return sorted.slice(start, start + 3);
}

export function LeaderboardWidget({
  rows, selfName, title,
}: { rows: LbRow[]; selfName: string; title: string }) {
  const window = neighbours(rows, selfName);
  return (
    <div className="box c12">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>
      {window.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No rankings yet.</p>
      ) : (
        <ul className="mt-2.5 space-y-1">
          {window.map((r) => {
            const isSelf = r.name === selfName;
            return (
              <li key={r.name} className={cn(
                "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                isSelf ? "bg-ink text-primary-foreground font-medium" : "text-foreground",
              )}>
                <span className="flex items-center gap-2.5 truncate">
                  <span className="tabular-nums opacity-60">{r.rank}</span>
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="tabular-nums">{r.pct.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
