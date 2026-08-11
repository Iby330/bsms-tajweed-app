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
            "appearance-none rounded-md border border-line bg-card",
            "py-1 pl-2.5 pr-7 text-xs text-foreground",
            "transition-colors hover:border-ink/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground"
        >
          ▼
        </span>
      </span>
    </div>
  );
}
