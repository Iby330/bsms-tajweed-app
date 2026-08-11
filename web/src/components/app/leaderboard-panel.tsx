"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
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
  const selectId = useId();

  const scope = scopes.find((s) => s.key === activeKey) ?? scopes[0];
  if (!scope) return null;

  const sorted = [...scope.rows].sort((a, b) => a.rank - b.rank);
  const shown = expanded ? sorted : neighbours(scope.rows, scope.selfName);
  const canExpand = sorted.length > shown.length || expanded;

  return (
    <div className="flex flex-col rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>

        {scopes.length > 1 && (
          <div className="relative">
            <label htmlFor={selectId} className="sr-only">
              {title} leaderboard scope
            </label>
            {/* A native select, so a phone opens its own picker rather than a
                bespoke menu that has to be styled and dismissed by hand. */}
            <select
              id={selectId}
              value={scope.key}
              aria-controls={groupId}
              onChange={(e) => {
                setActiveKey(e.target.value);
                // Collapse on switch: how much of one scope you opened up says
                // nothing about how much of the other you wanted to see.
                setExpanded(false);
              }}
              className={cn(
                "appearance-none rounded-md border border-line bg-card",
                "py-1 pl-2.5 pr-7 text-xs text-foreground",
                "transition-colors hover:border-ink/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {scopes.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground"
            >
              ▼
            </span>
          </div>
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
                    "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                    isSelf ? "bg-ink font-medium text-primary-foreground" : "text-foreground",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="w-5 shrink-0 text-right tabular-nums opacity-60">{r.rank}</span>
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{r.pct.toFixed(1)}%</span>
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
