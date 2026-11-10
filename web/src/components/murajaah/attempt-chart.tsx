"use client";

/**
 * AttemptChart: one vertical bar per murāja'ah attempt, used identically by
 * the listener's "My revision" and the teacher's student panel.
 *
 * - Bar height = the time (per unit in "All juz" / "All hizb"); fill = its
 *   band (Ideal solid --ok, Good --ok tint, Acceptable --warn, Too slow
 *   --danger). The latest bar carries an outline.
 * - The band limits are faint dashed reference lines, labelled at the y axis.
 * - Each bar shows its mistakes above it, in --danger when over the limit.
 * - Every bar is keyboard-focusable, with a hover/focus tip and a <title>.
 * - More than `maxBars` attempts: the latest `maxBars`, with a note.
 *
 * Feed it `chartBars()` from lib/murajaah/chart-data. Presentational only.
 * Colours are app tokens; dates are pinned to Europe/London (the programme's
 * zone) so the server and the browser render the same text.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BAND_LABEL, BAND_TONE, BANDS, formatClock, type BandLimits } from "@/lib/murajaah/bands";
import type { ChartBar } from "@/lib/murajaah/chart-data";
import { cn } from "@/lib/utils";

export type AttemptChartProps = {
  /** In date order, oldest first (chartBars gives them so). */
  bars: ChartBar[];
  /** Band limits in ms for the bars' scale. */
  refLines: BandLimits;
  /** Set for "All juz" / "All hizb": bars are per unit. */
  perUnit?: "hizb" | "juz" | null;
  /** The figure's accessible name, e.g. "Yunus Zafar, All juz". */
  ariaLabel?: string;
  /** How many bars fit; the latest are shown. Default 12. */
  maxBars?: number;
  className?: string;
};

const H = 220;
const PAD = { top: 22, right: 8, bottom: 26, left: 50 };
const STEPS_MIN = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 360, 480];

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const fmtDate = (iso: string) => DATE.format(new Date(iso));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The words of a bar's <title> and aria-label. */
function describeBar(b: ChartBar, attempt: number): string {
  const time = b.perUnit
    ? `${formatClock(b.totalMs)} (${formatClock(b.valueMs)} per ${b.perUnit})`
    : formatClock(b.totalMs);
  const mistakes = b.mistakes > b.limit
    ? `${plural(b.mistakes, "mistake")}, over the limit of ${b.limit}`
    : `${plural(b.mistakes, "mistake")}, within the limit of ${b.limit}`;
  return `Attempt ${attempt}: ${b.label}, ${fmtDate(b.date)}. ${time}, ${BAND_LABEL[b.band]}. ${mistakes}.`;
}

function niceTicks(maxMs: number): number[] {
  const maxMin = maxMs / 60_000;
  const step = STEPS_MIN.find((s) => maxMin / s <= 5) ?? Math.ceil(maxMin / 5 / 60) * 60;
  const n = Math.max(1, Math.ceil(maxMin / step));
  return Array.from({ length: n + 1 }, (_, i) => i * step * 60_000);
}

export function AttemptChart({ bars, refLines, perUnit = null, ariaLabel, maxBars = 12, className }: AttemptChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, bars.length - maxBars);
  const shown = bars.slice(start);

  const geo = useMemo(() => {
    const top = Math.max(refLines.acceptable, ...shown.map((b) => b.valueMs)) * 1.08;
    const ticks = niceTicks(top);
    const yMax = ticks[ticks.length - 1];
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = H - PAD.top - PAD.bottom;
    const y = (ms: number) => PAD.top + plotH - (ms / yMax) * plotH;
    const slot = plotW / Math.max(1, shown.length);
    const barW = Math.max(6, Math.min(36, slot * 0.6));
    const cx = (i: number) => PAD.left + slot * (i + 0.5);

    // Reference labels sit just above their line; keep them 11px apart.
    const refs = (["ideal", "good", "acceptable"] as const).map((k) => ({ k, ms: refLines[k], y: y(refLines[k]) }));
    let floor = -Infinity;
    const refLabels = [...refs].sort((a, b) => b.y - a.y).map((r) => {
      const ly = Math.min(r.y - 3, floor === -Infinity ? r.y - 3 : floor - 11);
      floor = ly;
      return { ...r, ly };
    });
    return { ticks, y, cx, barW, plotW, plotH, refs, refLabels };
  }, [shown, refLines, width]);

  if (!bars.length) {
    return (
      <div className={cn("rounded-lg border border-border p-4 text-sm text-muted-foreground", className)}>
        No attempts yet. Each saved revision adds a bar here.
      </div>
    );
  }

  const baseline = PAD.top + geo.plotH;
  const tip = active === null ? null : shown[active];

  return (
    <figure className={cn("m-0", className)} aria-label={ariaLabel}>
      <p className="mb-1 text-xs text-muted-foreground">
        {perUnit ? `Time per ${perUnit}; a longer attempt is divided by its ${perUnit === "juz" ? "juz" : "hizb"} count.` : "Time per attempt."}
        {start > 0 && <> Showing the last {maxBars} of {bars.length}.</>}
      </p>
      <div ref={wrap} className="relative w-full">
        <svg width={width} height={H} role="group" aria-label={ariaLabel ?? "Attempts"} className="block overflow-visible tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={width} height={baseline} />
            </clipPath>
          </defs>

          {/* y axis: clock times */}
          {geo.ticks.map((t) => (
            <text key={t} data-y-label x={PAD.left - 6} y={geo.y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {formatClock(t)}
            </text>
          ))}

          {/* band limits */}
          {geo.refs.map((r) => (
            <line key={r.k} x1={PAD.left} x2={PAD.left + geo.plotW} y1={r.y} y2={r.y}
              stroke={BAND_TONE[r.k].stroke} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />
          ))}

          {/* bars */}
          {shown.map((b, i) => {
            const tone = BAND_TONE[b.band];
            const top = geo.y(b.valueMs);
            const h = Math.max(1, baseline - top);
            const x = geo.cx(i) - geo.barW / 2;
            const latest = i === shown.length - 1;
            const over = b.mistakes > b.limit;
            const text = describeBar(b, start + i + 1);
            return (
              <g key={b.id}>
                {/* a hit area the full height of the column, bigger than the mark */}
                <rect x={geo.cx(i) - Math.max(geo.barW, 22) / 2} y={PAD.top} width={Math.max(geo.barW, 22)} height={geo.plotH}
                  fill="transparent" aria-hidden="true"
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
                <rect
                  data-bar
                  data-latest={latest ? "true" : undefined}
                  x={x} y={top} width={geo.barW} height={h + 4} rx={4}
                  clipPath={`url(#${clipId})`}
                  fill={tone.fill} stroke={b.band === "good" ? tone.stroke : "none"} strokeWidth={b.band === "good" ? 1 : 0}
                  tabIndex={0}
                  role="img"
                  aria-label={text}
                  onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                  className="outline-none"
                >
                  <title>{text}</title>
                </rect>
                {latest && (
                  <rect data-latest-outline x={x - 3} y={top - 3} width={geo.barW + 6} height={h + 3}
                    fill="none" stroke="var(--foreground)" strokeWidth={1.5} rx={6} aria-hidden="true" pointerEvents="none" />
                )}
                {active === i && (
                  <rect x={x - 3} y={top - 3} width={geo.barW + 6} height={h + 3}
                    fill="none" stroke="var(--ring)" strokeWidth={2} rx={6} aria-hidden="true" pointerEvents="none" />
                )}
                <text data-mistakes x={geo.cx(i)} y={top - 7} textAnchor="middle" fontSize={10}
                  fontWeight={over ? 600 : 400} fill={over ? "var(--danger)" : "var(--muted-foreground)"} aria-hidden="true">
                  {b.mistakes} ✕
                </text>
                <text data-x-label x={geo.cx(i)} y={baseline + 16} textAnchor="middle" fontSize={10}
                  fontWeight={latest ? 600 : 400} fill={latest ? "var(--foreground)" : "var(--muted-foreground)"} aria-hidden="true">
                  {start + i + 1}
                </text>
              </g>
            );
          })}

          {/* baseline, then the reference labels over everything, haloed */}
          <line x1={PAD.left} x2={PAD.left + geo.plotW} y1={baseline} y2={baseline} stroke="var(--border)" strokeWidth={1} />
          {geo.refLabels.map((r) => (
            <text key={r.k} data-ref x={PAD.left + 4} y={r.ly} fontSize={10} fill="var(--muted-foreground)"
              stroke="var(--card)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
              {`${BAND_LABEL[r.k]} ${formatClock(r.ms)}`}
            </text>
          ))}
        </svg>

        {tip && active !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground shadow-md tabular-nums"
            style={{
              left: Math.min(Math.max(geo.cx(active), 90), width - 90),
              top: Math.max(0, geo.y(tip.valueMs) - 20),
            }}
          >
            <div className="font-medium">Attempt {start + active + 1} · {tip.label}</div>
            <div className="text-muted-foreground">{fmtDate(tip.date)}</div>
            <div>
              {formatClock(tip.totalMs)}
              {tip.perUnit && <> · {formatClock(tip.valueMs)} per {tip.perUnit}</>}
              {" · "}{BAND_LABEL[tip.band]}
            </div>
            <div className={tip.mistakes > tip.limit ? "text-danger" : undefined}>
              {plural(tip.mistakes, "mistake")}
              {tip.mistakes > tip.limit ? `, over the limit of ${tip.limit}` : ` (limit ${tip.limit})`}
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {BANDS.map((b) => (
          <span key={b} className="inline-flex items-center gap-1">
            <svg width={10} height={10} aria-hidden="true">
              <rect width={10} height={10} rx={2} fill={BAND_TONE[b].fill} stroke={BAND_TONE[b].stroke} strokeWidth={b === "good" ? 1 : 0} />
            </svg>
            {BAND_LABEL[b]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <svg width={14} height={10} aria-hidden="true">
            <line x1={0} x2={14} y1={5} y2={5} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
          </svg>
          Band limits
        </span>
        <span>✕ = mistakes</span>
      </figcaption>

      <table className="sr-only">
        <caption>{ariaLabel ?? "Attempts"}</caption>
        <thead>
          <tr><th>Attempt</th><th>Portion</th><th>Date</th><th>Time</th><th>Band</th><th>Mistakes</th><th>Limit</th></tr>
        </thead>
        <tbody>
          {shown.map((b, i) => (
            <tr key={b.id}>
              <td>{start + i + 1}</td>
              <td>{b.label}</td>
              <td>{fmtDate(b.date)}</td>
              <td>{formatClock(b.totalMs)}{b.perUnit ? ` (${formatClock(b.valueMs)} per ${b.perUnit})` : ""}</td>
              <td>{BAND_LABEL[b.band]}</td>
              <td>{b.mistakes}</td>
              <td>{b.limit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
