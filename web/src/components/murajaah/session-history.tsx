"use client";

/**
 * SessionHistory: every saved attempt, newest first, each row expandable to
 * its checkpoint splits, its mistake types and its note. Shared by the
 * listener's "My revision" (show the listener) and the teacher's student
 * page (show the listener too, or the reciter for a listener's log).
 *
 * Each row is judged as it was at the time: sessionOutcome() bands the time
 * on the session's own snapshot minutes and counts mistakes against its own
 * snapshot limit, so a later change of targets never rewrites history.
 */
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BandPill, LimitMark } from "@/components/murajaah/band-pill";
import { formatClock } from "@/lib/murajaah/bands";
import { stretchesOf } from "@/lib/murajaah/checkpoints";
import { sessionOutcome, type MarkCategory, type SessionView } from "@/lib/murajaah/sessions";
import { cn } from "@/lib/utils";

export type SessionHistoryProps = {
  sessions: SessionView[];
  /** Whose name each row carries: the listener ("Listened to by …") or the reciter ("Recited by …"). */
  show: "listener" | "reciter";
  /** The card's heading. Default "Revision history". */
  title?: string;
  /** What an empty list says. */
  emptyText?: string;
  className?: string;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const dateOf = (s: SessionView) => s.submittedAt ?? s.clock.finished_at ?? s.createdAt;

/** The mistake types, in the taxonomy's order; Fluency only shows when used. */
const TYPES: { id: MarkCategory | "untyped"; label: string; always: boolean }[] = [
  { id: "hifz", label: "Hifdh", always: true },
  { id: "tajweed", label: "Tajweed", always: true },
  { id: "makhraj", label: "Makhraj", always: true },
  { id: "fluency", label: "Fluency", always: false },
  { id: "untyped", label: "Untyped", always: true },
];

function typeCounts(s: SessionView) {
  const n: Record<string, number> = {};
  for (const m of s.marks) n[m.category ?? "untyped"] = (n[m.category ?? "untyped"] ?? 0) + 1;
  return TYPES.filter((t) => t.always || n[t.id]).map((t) => ({ ...t, count: n[t.id] ?? 0 }));
}

function Details({ s, id }: { s: SessionView; id: string }) {
  const stretches = stretchesOf({
    kind: s.kind,
    ns: s.ns,
    ticked: s.checkpoints,
    markAts: s.marks.map((m) => m.atMs),
    endMs: s.clock.elapsed_ms,
    minutes: s.minutes,
  });
  const longest = Math.max(1, ...stretches.map((x) => x.ms));
  const types = typeCounts(s);

  return (
    <div id={id} className="grid gap-5 border-t border-border bg-muted/30 px-4 py-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <p className="label mb-2">Checkpoints</p>
        {stretches.length > 1 ? (
          <ol className="space-y-1.5" data-splits>
            {stretches.map((x, i) => (
              <li key={`${x.kind}-${x.ord ?? "final"}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 text-sm sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_auto]">
                <span className="truncate">{x.label}</span>
                <span aria-hidden className="hidden h-1.5 rounded-full bg-border sm:block">
                  <span className="block h-full rounded-full bg-brand/40" style={{ width: `${((x.ms / longest) * 100).toFixed(1)}%` }} />
                </span>
                {x.band ? (
                  <BandPill band={x.band} ms={x.ms} size="sm" />
                ) : (
                  <span className="text-xs tabular-nums">{formatClock(x.ms)}</span>
                )}
                <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                  <b className={cn("text-foreground", x.mistakes > 0 && "font-semibold")}>{x.mistakes}</b>{" "}
                  {x.mistakes === 1 ? "mistake" : "mistakes"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Logged as one piece, without checkpoints.</p>
        )}
      </div>
      <div className="min-w-0">
        <p className="label mb-2">Mistake types</p>
        <ul className="flex flex-wrap gap-1.5" data-types>
          {types.map((t) => (
            <li
              key={t.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs",
                t.count === 0 && "text-muted-foreground",
              )}
            >
              {t.label} <b className="tabular-nums">{t.count}</b>
            </li>
          ))}
        </ul>
        {s.note && (
          <>
            <p className="label mt-4 mb-1">Note</p>
            <p className="text-sm whitespace-pre-line">{s.note}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function SessionHistory({
  sessions, show, title = "Revision history", emptyText = "No saved attempts yet.", className,
}: SessionHistoryProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // Newest first, each numbered as its attempt on that portion.
  const rows = useMemo(() => {
    const saved = sessions.filter((s) => s.submittedAt);
    const oldest = [...saved].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const seen = new Map<string, number>();
    const nth = new Map<string, number>();
    for (const s of oldest) {
      const n = (seen.get(s.label) ?? 0) + 1;
      seen.set(s.label, n);
      nth.set(s.id, n);
    }
    return oldest.reverse().map((s) => ({ s, attempt: nth.get(s.id)!, outcome: sessionOutcome(s) }));
  }, [sessions]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={cn("field", className)}>
      <section className="box c12 gap-0 p-0" aria-label={title}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
          <h3 className="text-base font-semibold">{title}</h3>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">{plural(rows.length, "attempt")}, newest first</span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="border-t border-border">
            {rows.map(({ s, attempt, outcome }) => {
              const isOpen = open.has(s.id);
              const detailId = `hist-${s.id}`;
              const d = new Date(dateOf(s));
              const who = show === "listener" ? s.listenerName : s.reciterName;
              return (
                <li key={s.id} className="border-b border-border last:border-b-0" data-session={s.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={detailId}
                    onClick={() => toggle(s.id)}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:grid-cols-[8.5rem_minmax(0,1.2fr)_minmax(0,1fr)_auto_7.5rem_1rem]"
                  >
                    <span className="min-w-0 truncate max-md:order-3 max-md:text-xs max-md:text-muted-foreground">
                      <b className="font-medium max-md:font-normal">{DAY.format(d)}</b>
                      <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{TIME.format(d)}</span>
                      <span className="md:hidden"> · {who}</span>
                    </span>
                    <span className="min-w-0 max-md:order-1">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-xs text-muted-foreground"> · attempt {attempt}</span>
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground max-md:hidden">
                      {show === "listener" ? "Listened to by " : "Recited by "}
                      <span className="text-foreground">{who}</span>
                    </span>
                    <span className="justify-self-end max-md:order-2">
                      <BandPill band={outcome.band} ms={outcome.totalMs} />
                    </span>
                    <span className="flex items-center gap-2 justify-self-end max-md:order-4 md:justify-self-start">
                      <LimitMark mistakes={outcome.mistakes} limit={outcome.limit} />
                      <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform md:hidden", isOpen && "rotate-180")} />
                    </span>
                    <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform max-md:hidden", isOpen && "rotate-180")} />
                    <span className="sr-only">{isOpen ? "Hide splits" : "Show splits"}</span>
                  </button>
                  {isOpen && <Details s={s} id={detailId} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
