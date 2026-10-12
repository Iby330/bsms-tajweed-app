"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { HwView } from "@/lib/teacher/homework-view";
import { rememberHwView } from "@/lib/teacher/homework-view-actions";
import { cn } from "@/lib/utils";

/**
 * List or Table, beside the class filter.
 *
 * The choice goes in a cookie (set by a server action) so the screen opens the
 * way the teacher left it, and in `?view=` so this render picks it up at once. `replace` for the same
 * reason the class filter uses it: one back-button entry per toggle is noise.
 */
export function HomeworkViewToggle({ view }: { view: HwView }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const pick = (next: HwView) => {
    if (next === view) return;
    void rememberHwView(next);
    const q = new URLSearchParams(params.toString());
    q.set("view", next);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };

  const option = (value: HwView, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => pick(value)}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 px-4 text-sm font-medium transition-colors",
        view === value
          ? "bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground"
          : "bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div role="group" aria-label="View as" className="inline-flex shrink-0 overflow-hidden border border-line">
      {option(
        "list",
        "List",
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>,
      )}
      {option(
        "table",
        "Table",
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" />
          <path d="M3 10h18M9 4v16M15 4v16" />
        </svg>,
      )}
    </div>
  );
}

export type WeekTab = {
  id: string;
  label: string;
  /** Which homework it holds, e.g. "HW 3 to 6". */
  sub: string;
  waiting: number;
};

/**
 * The table view's weeks: this week first, last week, then any older week
 * that still has scripts to mark. Every panel is rendered on the server and
 * handed over whole, so switching is instant and nothing is fetched.
 *
 * On this week's tab, work still waiting in an earlier week is called out above
 * the grid, so moving to the table never hides the backlog the list shows.
 */
export function HomeworkWeekTabs({ tabs, panels }: { tabs: WeekTab[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);

  const earlier = tabs.slice(1);
  const earlierWaiting = earlier.reduce((n, t) => n + t.waiting, 0);
  const firstWaiting = tabs.findIndex((t, i) => i > 0 && t.waiting > 0);

  return (
    <>
      <div role="tablist" aria-label="Week" className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t, i) => {
          const on = i === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 border px-4 text-sm font-medium transition-colors",
                on
                  ? "border-brand/40 bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground"
                  : "border-line bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
              <span className="font-normal text-muted-foreground">{t.sub}</span>
              {t.waiting > 0 && (
                <span
                  className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warn"
                >
                  {t.waiting} waiting
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active === 0 && earlierWaiting > 0 && firstWaiting > 0 && (
        <button
          type="button"
          onClick={() => setActive(firstWaiting)}
          className="mb-4 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-warn/30 bg-warn/10 px-4 py-2.5 text-left text-sm font-medium text-warn"
        >
          <span>
            {earlierWaiting} script{earlierWaiting === 1 ? "" : "s"} still waiting from{" "}
            {earlier.filter((t) => t.waiting > 0).length === 1 ? "an earlier week" : "earlier weeks"}
          </span>
          <span className="underline underline-offset-2">Show that week</span>
        </button>
      )}

      <div role="tabpanel">{panels[active]}</div>
    </>
  );
}
