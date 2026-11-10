"use client";

/**
 * ProgressChart: the portion select, the attempt chart and its one-line
 * caption. One component for both sides: the listener's "My revision" and
 * the teacher's student page.
 *
 * - Views come from chartViews(): All juz, All hizb, then each single
 *   portion label; the default is chartViews' own pick.
 * - Bars come from chartBars() with the target passed in. The teacher's
 *   targets panel passes its UNSAVED target here, so the chart previews it.
 * - The caption reads like the prototype: "Attempt 7 (Juz 30), 4 Nov: 16:20
 *   (ideal) and 3 mistakes, within the limit of 5. Since attempt 1: …".
 *
 * Props are serialisable (SessionView is plain JSON), so a server component
 * can hand them straight over.
 */
import { useMemo, useState } from "react";
import { AttemptChart } from "@/components/murajaah/attempt-chart";
import { FilterSelect } from "@/components/app/filter-select";
import { BAND_LABEL, BAND_TONE, formatClock } from "@/lib/murajaah/bands";
import { chartBars, chartViews, type ChartData } from "@/lib/murajaah/chart-data";
import type { SessionView } from "@/lib/murajaah/sessions";
import type { ClassTarget, TargetOverride } from "@/lib/murajaah/targets";
import { cn } from "@/lib/utils";

export type ProgressChartProps = {
  /** The student's saved sessions (as reciter), any order. */
  sessions: SessionView[];
  /** The class target to judge bars by (the teacher's live edit, or the saved one). */
  target: ClassTarget;
  /** The student's own limits, if any. */
  override?: TargetOverride | null;
  /** The card's heading. Default "Progress by attempt". */
  title?: string;
  /** Whose attempts these are, for the chart's accessible name. */
  name?: string;
  className?: string;
};

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The sentence under the chart, as parts so the figures can be bold. */
export function captionParts(data: ChartData, aggregate: boolean): { text: string; bold?: boolean }[] {
  const { bars, perUnit } = data;
  const L = bars[bars.length - 1];
  if (!L) return [];
  const F = bars[0];
  const over = L.mistakes > L.limit;
  const out: { text: string; bold?: boolean }[] = [
    { text: `Attempt ${bars.length}`, bold: true },
    { text: `${aggregate ? ` (${L.label})` : ""}, ${DAY.format(new Date(L.date))}: ` },
    { text: formatClock(L.totalMs), bold: true },
    { text: `${perUnit && L.valueMs !== L.totalMs ? `, ${formatClock(L.valueMs)} per ${perUnit}` : ""} (${BAND_LABEL[L.band].toLowerCase()}) and ` },
    { text: plural(L.mistakes, "mistake"), bold: true },
    { text: `, ${over ? "over" : "within"} the limit of ${L.limit}.` },
  ];
  if (bars.length > 1) {
    const dt = L.valueMs - F.valueMs;
    const dm = L.mistakes - F.mistakes;
    const per = perUnit ? ` per ${perUnit}` : "";
    out.push({ text: " Since attempt 1: " });
    if (Math.round(dt / 1000) === 0) out.push({ text: "same time" });
    else out.push({ text: `${formatClock(Math.abs(dt))}${per} ${dt < 0 ? "faster" : "slower"}`, bold: true });
    out.push({ text: ", " });
    if (dm === 0) out.push({ text: "same mistakes" });
    else out.push({ text: `${plural(Math.abs(dm), "mistake")} ${dm < 0 ? "fewer" : "more"}`, bold: true });
    out.push({ text: "." });
  } else {
    out.push({ text: ` Only one attempt ${perUnit ? `on a ${perUnit}` : "on this portion"} so far.` });
  }
  return out;
}

export function ProgressChart({
  sessions, target, override = null, title = "Progress by attempt", name, className,
}: ProgressChartProps) {
  const { views, defaultId } = useMemo(() => chartViews(sessions), [sessions]);
  const [picked, setPicked] = useState<string | null>(null);
  // A pick that no longer exists (the sessions changed) falls back to the default.
  const viewId = picked && views.some((v) => v.id === picked) ? picked : defaultId;
  const view = views.find((v) => v.id === viewId) ?? null;

  const data = useMemo(
    () => (viewId ? chartBars(sessions, viewId, target, override) : null),
    [sessions, viewId, target, override],
  );
  const aggregate = view?.kind !== "portion";
  const unit = data?.perUnit;

  return (
    <div className={cn("field", className)}>
    <section className="box c12" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {views.length > 0 && viewId && (
          <FilterSelect
            label="Portion"
            value={viewId}
            onChange={setPicked}
            options={views.map((v) => ({ value: v.id, label: `${v.name} (${plural(v.count, "attempt")})` }))}
          />
        )}
      </div>

      {data && data.bars.length > 0 ? (
        <>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Key">
            {(["ideal", "good", "acceptable", "slow"] as const).map((b) => (
              <li key={b} className="inline-flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="inline-block size-2.5 rounded-[3px] border"
                  style={{ background: BAND_TONE[b].fill, borderColor: BAND_TONE[b].stroke }}
                />
                {BAND_LABEL[b]}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <i aria-hidden className="inline-block w-4 border-t border-dashed border-muted-foreground" />
              Band limits{unit ? ` for one ${unit}` : ""}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <b className="text-danger">n</b> mistakes over the limit
            </li>
          </ul>
          <AttemptChart
            bars={data.bars}
            refLines={data.refLines}
            perUnit={data.perUnit}
            ariaLabel={[name, view?.name].filter(Boolean).join(", ")}
          />
          <p className="text-sm" aria-live="polite" data-caption>
            {captionParts(data, aggregate).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
          </p>
        </>
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No attempts yet. Each saved revision adds a bar here.
        </p>
      )}
    </section>
    </div>
  );
}
