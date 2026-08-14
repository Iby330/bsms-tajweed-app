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
    <section className="box c6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">{title}</span>

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

      <div id={groupId}>
        {shown.length === 0 ? (
          <p className="note">No rankings yet.</p>
        ) : (
          <ol className={cn("lb", expanded && "max-h-72 overflow-y-auto pr-1")}>
            {shown.map((r) => {
              const isSelf = r.name === scope.selfName;
              return (
                <li
                  key={`${r.rank}-${r.name}`}
                  data-self={isSelf || undefined}
                  className={cn("row", isSelf && "me")}
                >
                  <span className="rk">{r.rank}</span>
                  {/* The bar is the score itself, not a share of the leader's:
                      70% is drawn at 70%, so the gaps read as they really are. */}
                  <span className="bw">
                    <span
                      data-bar
                      data-self={isSelf}
                      className="bar transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
                    />
                    <span className="nm">{r.name}</span>
                  </span>
                  <span className="sc">{r.pct.toFixed(1)}%</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={groupId}
          className={cn(
            "note self-start underline underline-offset-4",
            "transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {expanded ? "Show less" : `See all ${sorted.length} ${scope.noun} →`}
        </button>
      )}
    </section>
  );
}
