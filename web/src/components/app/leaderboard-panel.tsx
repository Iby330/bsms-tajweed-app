"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/app/filter-select";
import { neighbours, type LbRow } from "./leaderboard-widget";

export type LbScope = {
  key: string;
  /** Text on the toggle button. */
  label: string;
  rows: LbRow[];
  /**
   * The row to highlight. A person's name in an individual ranking, but the
   * student's CLASS name when the rows are classes — "you" means something
   * different depending on what is being ranked.
   */
  selfName: string;
  /** What a row is, for the empty state and the expand affordance. */
  noun: string;
};

/**
 * A leaderboard that can switch scope and open up in place.
 *
 * Collapsed it shows the three-row window (above / you / below) the dashboard
 * has always shown — enough to know if you are moving. Expanding reveals the
 * whole table without leaving Home, because the question "where am I overall"
 * is asked from here, and bouncing to another page to answer it loses the
 * context that prompted it.
 */
export function LeaderboardPanel({
  title,
  scopes,
}: {
  title: string;
  scopes: LbScope[];
}) {
  const [activeKey, setActiveKey] = useState(scopes[0]?.key);
  const [expanded, setExpanded] = useState(false);
  const groupId = useId();

  const scope = scopes.find((s) => s.key === activeKey) ?? scopes[0];
  if (!scope) return null;

  const sorted = [...scope.rows].sort((a, b) => a.rank - b.rank);
  const shown = expanded ? sorted : neighbours(scope.rows, scope.selfName);
  const canExpand = sorted.length > shown.length || expanded;

  return (
    <div className="glass glass-hover flex flex-col rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>

        {scopes.length > 1 && (
          <FilterSelect
            label={`${title} leaderboard scope`}
            hideLabel
            value={scope.key}
            options={scopes.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(v) => {
              setActiveKey(v);
              // Collapse on switch: how much of one scope you opened up says
              // nothing about how much of the other you wanted to see.
              setExpanded(false);
            }}
            controls={groupId}
          />
        )}
      </div>

      <div id={groupId} className="mt-2.5 flex-1">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rankings yet.</p>
        ) : (
          <ul
            className={cn(
              "space-y-1",
              // Expanded lists can run long — keep the card a sane height and
              // let the table itself scroll.
              expanded && "max-h-72 overflow-y-auto pr-1",
            )}
          >
            {shown.map((r) => {
              const isSelf = r.name === scope.selfName;
              return (
                <li
                  key={`${r.rank}-${r.name}`}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-sm",
                    isSelf ? "bg-ink font-medium text-primary-foreground" : "text-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="w-5 shrink-0 text-right tabular-nums opacity-60">
                        {r.rank}
                      </span>
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{r.pct.toFixed(1)}%</span>
                  </div>
                  {/* The bar makes the gaps visible: three names within a point
                      of each other is a different race from three ten apart. */}
                  <div
                    className={cn(
                      "mt-1 h-1.5 overflow-hidden rounded-full",
                      isSelf ? "bg-primary-foreground/20" : "bg-foreground/10",
                    )}
                  >
                    <div
                      data-bar
                      data-self={isSelf}
                      style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
                      className={cn(
                        "h-full rounded-full transition-[width] duration-700 ease-out",
                        isSelf ? "bg-primary-foreground data-glow" : "bg-chart-3",
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={groupId}
          className={cn(
            "mt-3 self-start rounded text-xs text-ink-2 underline underline-offset-4",
            "transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {expanded ? "Show less" : `See all ${sorted.length} ${scope.noun} →`}
        </button>
      )}
    </div>
  );
}
