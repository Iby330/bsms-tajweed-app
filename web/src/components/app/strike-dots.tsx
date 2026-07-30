import { cn } from "@/lib/utils";

export type StrikeInfo = { reason: string; note: string | null; issued_at: string };

/** Three slots — filled = strike taken this term. Three means removal. */
export function StrikeDots({ strikes }: { strikes: StrikeInfo[] }) {
  const n = Math.min(strikes.length, 3);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            title={strikes[i] ? `${strikes[i].reason}${strikes[i].note ? ` — ${strikes[i].note}` : ""}` : "no strike"}
            className={cn(
              "size-2.5 rounded-full",
              i < n ? "bg-danger" : "border border-line bg-transparent",
            )}
          />
        ))}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{n} of 3</span>
    </span>
  );
}
