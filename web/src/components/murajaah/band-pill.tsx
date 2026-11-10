import { Check, X } from "lucide-react";
import { BAND_LABEL, BAND_TONE, formatClock, type Band } from "@/lib/murajaah/bands";
import { cn } from "@/lib/utils";

/**
 * The two verdicts every murāja'ah screen repeats: a time in its band's pill
 * ("16:20 IDEAL"), and mistakes against their limit ("3 / 5 ✓ met"). Shared
 * by the listener's history and the teacher's roster so the two never read
 * differently. Server-safe (no hooks); colours come from BAND_TONE.
 */
export function BandPill({
  band, ms, size = "md", className,
}: {
  band: Band;
  /** The time to print in the pill; omit for a label-only pill. */
  ms?: number | null;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      data-band={band}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md whitespace-nowrap tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm",
        BAND_TONE[band].pill,
        className,
      )}
    >
      {ms != null && <b className="font-semibold">{formatClock(ms)}</b>}
      <span className="text-[0.66rem] font-semibold tracking-[0.08em] uppercase">{BAND_LABEL[band]}</span>
    </span>
  );
}

/** "3 / 5 ✓ met" or "7 / 5 ✕ over". The limit is inclusive: N of N is met. */
export function LimitMark({
  mistakes, limit, className,
}: {
  mistakes: number;
  limit: number;
  className?: string;
}) {
  const over = mistakes > limit;
  return (
    <span
      data-over={over || undefined}
      className={cn("inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums", className)}
      aria-label={`${mistakes} of ${limit} mistakes, ${over ? "over the limit" : "limit met"}`}
    >
      <b className={cn("font-semibold", over && "text-danger")}>{mistakes}</b>
      <span className="text-muted-foreground">/ {limit}</span>
      <span
        aria-hidden
        className={cn(
          "ml-1 inline-flex items-center gap-0.5 self-center text-[0.66rem] font-semibold tracking-[0.08em] uppercase",
          over ? "text-danger" : "text-ok",
        )}
      >
        {over ? <X className="size-3" /> : <Check className="size-3" />}
        {over ? "over" : "met"}
      </span>
    </span>
  );
}
