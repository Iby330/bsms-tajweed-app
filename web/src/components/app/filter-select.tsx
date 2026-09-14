"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

/**
 * The dashboard's one way of choosing between views of the same data.
 *
 * A native select, so a phone hands off to its own picker rather than asking
 * us to style, position and dismiss a menu inside cards that already scroll —
 * and so keyboard handling comes for free. Shared rather than restyled per
 * call site, because two hand-rolled selects drift apart the first time one
 * of them is touched.
 */
export function FilterSelect({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
  controls,
  className,
  size = "sm",
}: {
  /** Always present for screen readers; `hideLabel` only hides it visually. */
  label: string;
  hideLabel?: boolean;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** id of the region this select reorders or replaces, if any. */
  controls?: string;
  className?: string;
  /**
   * `lg` is for a select that IS the heading — it carries the page's subject
   * rather than filtering beneath one, so it takes heading weight and drops
   * the resting border, keeping only the chevron to say it opens. A prop
   * rather than a second component: the moment two selects are hand-rolled
   * apart they stop agreeing about focus rings and dark mode.
   */
  size?: "sm" | "lg";
}) {
  const id = useId();
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <label
        htmlFor={id}
        className={hideLabel ? "sr-only" : "text-xs text-muted-foreground"}
      >
        {label}
      </label>
      <span className="relative inline-flex">
        <select
          id={id}
          value={value}
          aria-controls={controls}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "appearance-none rounded-md bg-card text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "lg"
              ? // reads as the heading it replaces until you go near it
                "border border-transparent bg-transparent py-0.5 pl-1.5 pr-9 text-xl font-medium hover:border-line"
              : "border border-line py-1 pl-2.5 pr-7 text-xs hover:border-ink/30",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            size === "lg" ? "right-3 text-[11px]" : "right-2 text-[9px]",
          )}
        >
          ▼
        </span>
      </span>
    </div>
  );
}
