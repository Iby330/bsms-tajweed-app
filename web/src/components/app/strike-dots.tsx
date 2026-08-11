import { cn } from "@/lib/utils";

export type StrikeInfo = {
  reason: "absence" | "homework" | "conduct" | string;
  note: string | null;
  issued_at: string | null;
};

const REASON_LABELS: Record<string, string> = {
  absence: "Absence",
  homework: "Missed homework",
  conduct: "Conduct",
};

/** `issued_at` is timestamptz, so it renders in the reader's own zone —
 *  deliberately NOT the UTC-pinned fmtDay, which is for `date` columns. */
function issuedOn(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? null
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(ms));
}

/**
 * Three slots — one per strike a student can take in a term, the third
 * meaning removal from the course.
 *
 * Sized to be countable across the room rather than decorative: this is the
 * only figure on the dashboard with a real consequence attached, and as 10px
 * dots it read as ornament. Each taken strike carries its reason underneath,
 * because "you have 2 of 3" without saying what for is alarming and useless
 * in equal measure.
 */
export function StrikeDots({ strikes }: { strikes: StrikeInfo[] }) {
  const taken = Math.min(strikes.length, 3);
  const atRisk = taken >= 2;

  return (
    <div>
      <div className="flex items-center gap-4">
        <div
          className="flex gap-2"
          role="img"
          aria-label={`${taken} of 3 strikes taken this term`}
        >
          {[0, 1, 2].map((i) => {
            const strike = strikes[i];
            const isTaken = i < taken;
            // The third slot is the one that ends the course, so it stays
            // visibly distinct while empty rather than blending into the rest.
            const isFinal = i === 2;
            return (
              <span
                key={i}
                aria-hidden
                title={
                  strike
                    ? `${REASON_LABELS[strike.reason] ?? strike.reason}${strike.note ? ` — ${strike.note}` : ""}`
                    : isFinal
                      ? "Third strike — leaving the course"
                      : "No strike"
                }
                className={cn(
                  "grid size-10 place-items-center rounded-full border-2 text-sm font-medium transition-colors",
                  isTaken
                    ? "border-danger bg-danger/12 text-danger"
                    : isFinal
                      ? "border-dashed border-danger/30 text-danger/35"
                      : "border-dashed border-line text-muted-foreground/40",
                )}
              >
                {isTaken ? "✕" : i + 1}
              </span>
            );
          })}
        </div>

        <div className="min-w-0">
          <div
            className={cn(
              "font-heading text-2xl tabular-nums leading-none",
              taken === 0 ? "text-ok" : atRisk ? "text-danger" : "text-foreground",
            )}
          >
            {taken} <span className="text-base text-muted-foreground">of 3</span>
          </div>
          <p
            className={cn(
              "mt-1 text-xs",
              atRisk ? "font-medium text-danger" : "text-muted-foreground",
            )}
          >
            {taken === 0
              ? "None this term — keep it up"
              : taken === 3
                ? "Removal threshold reached"
                : taken === 2
                  ? "One more means leaving the course"
                  : "Two remaining this term"}
          </p>
        </div>
      </div>

      {taken > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2.5">
          {strikes.slice(0, 3).map((s, i) => {
            const on = issuedOn(s.issued_at);
            return (
              <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{REASON_LABELS[s.reason] ?? s.reason}</span>
                  {s.note && <span className="text-muted-foreground"> — {s.note}</span>}
                </span>
                {on && <span className="shrink-0 tabular-nums text-muted-foreground">{on}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
