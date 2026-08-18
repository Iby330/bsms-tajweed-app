import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { Rule } from "@/components/app/rule";
import { histogram, spread } from "@/lib/marking/responses";
import { fmtMarks, pctTone } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export type SummaryRow = {
  studentId: string;
  name: string;
  /** Their own script. */
  href: string;
  state: "approved" | "provisional" | "waiting" | "missing";
  marks: number | null;
  pct: number | null;
  late: boolean;
};

export type HardQuestion = {
  /** Position on the paper, as the Question tab numbers it. */
  n: number;
  prompt: string;
  pctOfMax: number;
  points: number;
};

/** A chip: tinted ground, coloured text. */
const toneClass = (pct: number) => {
  const tone = pctTone(pct);
  return cn(
    tone === "ok" && "bg-ok/12 text-ok",
    tone === "warn" && "bg-warn/12 text-warn",
    tone === "danger" && "bg-danger/12 text-danger",
  );
};

/** A bar: the same three colours, at a weight that reads as a solid at 4px. */
const barClass = (pct: number) => {
  const tone = pctTone(pct);
  return cn(
    tone === "ok" && "bg-ok/70",
    tone === "warn" && "bg-warn/70",
    tone === "danger" && "bg-danger/70",
  );
};

/**
 * One figure in the strip: label above, figure below, no card of its own.
 *
 * Label first so an unscored paper reads "Class average —" rather than a
 * dash with nothing attached to it.
 */
function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
}) {
  const empty = value === null || value === "";
  return (
    <div>
      <span className="label">{label}</span>
      <div className="fig">
        <span className={cn("v", empty && "opacity-40")}>{empty ? "—" : value}</span>
        {!empty && unit && <span className="u">{unit}</span>}
      </div>
    </div>
  );
}

const STATE_LABEL: Record<SummaryRow["state"], string> = {
  approved: "released",
  provisional: "not approved",
  waiting: "not yet marked",
  missing: "not submitted",
};

/**
 * How the class did, at a glance: the shape of the marks, the questions that
 * cost them, and then every student by name.
 *
 * The average counts provisional marks — a submission the model has scored but
 * the teacher has not approved — because the summary is most useful during
 * marking, not after it. Rows say which they are, and the count of unapproved
 * marks sits under the strip, so nothing here is quoted as final when it isn't.
 */
export function ResultsSummary({
  rows,
  totalMarks,
  hardest,
  questionHref,
}: {
  rows: SummaryRow[];
  totalMarks: number;
  /** The questions the class scored worst on. Empty until something is marked. */
  hardest: HardQuestion[];
  questionHref: string;
}) {
  const scored = rows.filter((r) => r.pct !== null);
  const stats = spread(scored.map((r) => r.pct!));
  const bands = histogram(scored.map((r) => r.pct!));
  const most = Math.max(1, ...bands.map((b) => b.count));

  const handedIn = rows.filter((r) => r.state !== "missing").length;
  const provisional = rows.filter((r) => r.state === "provisional").length;
  const waiting = rows.filter((r) => r.state === "waiting").length;

  return (
    <>
      <div className="field">
        <div className="box c12 statstrip">
          <Stat
            label="Handed in"
            value={handedIn}
            unit={`of ${rows.length}`}
          />
          <Stat label="Class average" value={stats ? `${Math.round(stats.mean)}%` : null} />
          <Stat label="Median" value={stats ? `${Math.round(stats.median)}%` : null} />
          <Stat
            label="Range"
            value={stats ? `${Math.round(stats.min)}–${Math.round(stats.max)}` : null}
            unit="%"
          />
        </div>
      </div>

      {(provisional > 0 || waiting > 0) && (
        <p className="text-xs text-muted-foreground">
          {provisional > 0 && (
            <>
              {provisional} mark{provisional === 1 ? "" : "s"} in these figures{" "}
              {provisional === 1 ? "is" : "are"} the model&apos;s and not yet approved
              {waiting > 0 && "; "}
            </>
          )}
          {waiting > 0 && (
            <>
              {waiting} submission{waiting === 1 ? "" : "s"} not marked at all, so{" "}
              {waiting === 1 ? "it counts" : "they count"} towards nothing above
            </>
          )}
          .
        </p>
      )}

      {stats && (
        <>
          <Rule label="Spread" />
          <div className="field">
            <div className="box c12">
              <ul className="flex flex-col gap-2">
                {bands.map((b) => (
                  <li key={b.from} className="flex items-center gap-3 text-xs">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                      {b.from}–{b.to}%
                    </span>
                    <span className="h-4 min-w-0 flex-1 bg-muted">
                      {/* Coloured by the middle of the band, not its floor —
                          a 40–59% band is a middling result, not a failing one. */}
                      <span
                        className={cn("block h-full", barClass((b.from + b.to) / 2))}
                        style={{ width: `${(b.count / most) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                      {b.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      {hardest.length > 0 && (
        <>
          <Rule label="Where the marks went" />
          <div className="field">
            <ul className="box c12 divide-y divide-line" style={{ padding: 0, gap: 0 }}>
              {hardest.map((q) => (
                <li key={q.n}>
                  <Link
                    href={questionHref}
                    className="flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <span className="flex min-w-0 gap-2.5">
                      <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                        Q{q.n}
                      </span>
                      <MixedText text={q.prompt} className="line-clamp-2 min-w-0 text-sm" />
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                        toneClass(q.pctOfMax),
                      )}
                    >
                      {Math.round(q.pctOfMax)}%
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Rule label="Every student" />
      <div className="field">
        <ul className="box c12 divide-y divide-line" style={{ padding: 0, gap: 0 }}>
          {rows.map((r) => {
            const body = (
              <>
                <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  {r.late && (
                    <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>
                  )}
                  {r.pct !== null && (
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-medium tabular-nums",
                        toneClass(r.pct),
                      )}
                    >
                      {Math.round(r.pct)}%
                    </span>
                  )}
                  {r.marks !== null && (
                    <span className="tabular-nums text-muted-foreground">
                      {fmtMarks(r.marks)}/{fmtMarks(totalMarks)}
                    </span>
                  )}
                  <span className="text-muted-foreground">{STATE_LABEL[r.state]}</span>
                </span>
              </>
            );
            return (
              <li key={r.studentId}>
                {r.state === "missing" ? (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 opacity-70">
                    {body}
                  </div>
                ) : (
                  <Link
                    href={r.href}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
