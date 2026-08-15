import { cn } from "@/lib/utils";

export type StrikeInfo = {
  reason: "absence" | "homework" | "conduct" | string;
  note: string | null;
  issued_at: string | null;
};

export const REASON_LABELS: Record<string, string> = {
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
 * The panel escalates with the count rather than looking the same at nought
 * as at two: calm and quiet when the record is clear, amber at one, red and
 * pulsing at two. The boot approaches as the slots fill and kicks once the
 * next strike would end the course. It is meant to raise a smile at two
 * strikes and then be understood — the consequence is real, and a student
 * who has stopped reading the words will still read a boot.
 *
 * Each taken strike carries its reason underneath, because "you have 2 of 3"
 * without saying what for is alarming and useless in equal measure.
 */
export function StrikeDots({ strikes }: { strikes: StrikeInfo[] }) {
  const taken = Math.min(strikes.length, 3);

  const line =
    taken === 0
      ? "None this term"
      : taken === 1
        ? "Two more would mean leaving the course"
        : taken === 2
          ? "One more means leaving the course"
          : "Removal threshold reached";

  return (
    <section className="box c4 strikebox" data-n={taken}>
      <span className="label">Strikes · this term</span>

      <div className="stat">
        <span className="v sm">{taken}</span>
        <span className="u">of 3</span>
      </div>

      <div className="runway">
        <span className="slots" role="img" aria-label={`${taken} of 3 strikes taken this term`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className={cn(i < taken && "on")}
              title={
                strikes[i]
                  ? `${REASON_LABELS[strikes[i].reason] ?? strikes[i].reason}${
                      strikes[i].note ? ` — ${strikes[i].note}` : ""
                    }`
                  : i === 2
                    ? "Third strike — leaving the course"
                    : "No strike"
              }
            />
          ))}
        </span>

        {/* Decorative: the count and the sentence carry the meaning. */}
        <svg className="boot" viewBox="0 0 60 44" aria-hidden>
          <rect x="34" y="1" width="19" height="25" rx="3" />
          <path d="M34,20 L34,32 Q34,38 27,38 L10,38 Q3,38 3,32 L3,29 Q3,25 9,24 L34,20 Z" />
          <rect x="0" y="36" width="56" height="7" rx="3.5" />
        </svg>
      </div>

      <div className="note">{line}</div>

      {taken > 0 && (
        <ul className="reasons">
          {strikes.slice(0, 3).map((s, i) => {
            const when = issuedOn(s.issued_at);
            return (
              <li key={i}>
                {REASON_LABELS[s.reason] ?? s.reason}
                {when ? ` · ${when}` : ""}
                {s.note ? ` · ${s.note}` : ""}
              </li>
            );
          })}
        </ul>
      )}

      <div className="note">Strikes reset at the start of each term.</div>
    </section>
  );
}
