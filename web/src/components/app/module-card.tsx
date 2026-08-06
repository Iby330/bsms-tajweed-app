import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { CountdownChip } from "@/components/app/countdown-chip";
import { thumbnailUrl } from "@/lib/lessons/youtube";
import { seriesShort } from "@/lib/lessons/series";
import { statusChip } from "@/lib/homework/logic";
import type { Module } from "@/lib/curriculum/tree";
import { cn } from "@/lib/utils";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The 16:9 slot at the middle of every card. Exactly one of three states:
 *  locked, no-video-yet, or a real poster frame (optionally ticked). */
function Poster({
  module: m,
  series,
}: {
  module: Module;
  series: string;
}) {
  const lesson = m.lessons.find((l) => l.youtube_id) ?? m.lessons[0];
  const src = thumbnailUrl(lesson?.youtube_id ?? null);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-muted">
      {!m.unlocked ? (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <span aria-hidden className="text-lg">🔒</span>
          <span className="text-xs tabular-nums">unlocks {dmy(m.unlockAt)}</span>
        </div>
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          /* hqdefault is 4:3 with 12.5% letterbox bars; object-cover into this
             16:9 box crops exactly those bars and nothing else. */
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <span aria-hidden className="text-lg">▸</span>
          <span className="text-xs">{seriesShort(series)} · video coming soon</span>
        </div>
      )}

      {m.unlocked && m.watched && (
        <span
          className="absolute right-2 top-2 rounded-full bg-ok/90 px-1.5 py-0.5 text-[11px] font-medium text-page"
          title="Watched"
        >
          ✓
        </span>
      )}
    </div>
  );
}

/**
 * One week of a course, as a card: a thin title strip, a 16:9 poster, and the
 * actions underneath.
 *
 * The whole card is the link to the lesson (a stretched overlay, not a wrapping
 * <a>), so the homework link can sit inside it without nesting anchors — nested
 * anchors are invalid HTML and break both keyboard nav and hydration.
 *
 * A locked week still renders: the weekly-release mechanic is only credible if
 * you can see what is coming and when.
 */
export function ModuleCard({
  module: m,
  series,
  pct,
}: {
  module: Module;
  /** Course series key, for the placeholder label. */
  series: string;
  /** Approved homework percentage, when the teacher has marked it. */
  pct?: number;
}) {
  const chip = m.homework ? statusChip(m.submission) : null;
  const lesson = m.lessons.find((l) => l.youtube_id) ?? m.lessons[0];
  const watchable = Boolean(lesson?.youtube_id);

  return (
    <li
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        m.unlocked ? "border-line hover:border-ink/30" : "border-dashed border-line",
      )}
    >
      {/* ── title strip ── */}
      <div className="flex items-baseline gap-2 px-3 py-2">
        {m.title ? (
          <MixedText
            text={m.title}
            className={cn(
              "line-clamp-1 min-w-0 flex-1 text-sm font-medium leading-snug",
              !m.unlocked && "text-muted-foreground",
            )}
          />
        ) : (
          /* moduleTitle() returns "" for the TFP rows — they carry no title
             beyond a number. The week label carries the strip alone. */
          <span className="min-w-0 flex-1" />
        )}
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
          Week {m.weekNumber}
        </span>
      </div>

      <Poster module={m} series={series} />

      {/* ── actions ── */}
      {m.unlocked && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {lesson && (
            /* Stretched overlay: makes the whole card the lesson link without
               wrapping the homework link in an anchor. */
            <Link
              href={`/lessons/${lesson.id}`}
              className="text-xs text-muted-foreground transition-colors before:absolute before:inset-0 hover:text-foreground"
            >
              <span aria-hidden>▸</span> {watchable ? "Watch" : "Details"}
            </Link>
          )}

          <span className="ml-auto flex items-center gap-2">
            {m.homework?.due_at && !m.submission && (
              <CountdownChip dueAt={m.homework.due_at} />
            )}

            {m.homework && (
              <Link
                href={`/homework/${m.homework.number}`}
                /* relative + z-10 lifts this above the stretched overlay above. */
                className="relative z-10 inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs transition-colors hover:border-ink/30"
              >
                <span>
                  {m.homework.series === "tfp" ? "TFP" : "HW"}{" "}
                  {m.homework.number > 100 ? m.homework.number - 100 : m.homework.number}
                </span>
                {chip && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-medium",
                      chip.tone === "ok" && "bg-ok/12 text-ok",
                      chip.tone === "warn" && "bg-warn/12 text-warn",
                      chip.tone === "ink" && "bg-muted text-foreground",
                      chip.tone === "muted" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {chip.label}
                    {m.submission === "approved" && pct !== undefined && (
                      <span className="ml-1 tabular-nums">{Math.round(pct)}%</span>
                    )}
                  </span>
                )}
              </Link>
            )}
          </span>
        </div>
      )}
    </li>
  );
}
