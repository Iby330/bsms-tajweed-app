/**
 * Time bands for murāja'ah. Pure and client-safe.
 *
 * The class sets minutes PER HIZB for three limits (defaults 10 / 15 / 20);
 * a portion's limits are those minutes × its size in hizb-equivalents. Each
 * edge is inside its band: exactly 10:00 on one hizb is Ideal.
 *
 * Wording (owner, 2026-11-10): the top band is "Ideal", never "gold".
 */

export type Band = "ideal" | "good" | "acceptable" | "slow";
export const BANDS: readonly Band[] = ["ideal", "good", "acceptable", "slow"];

export const BAND_LABEL: Record<Band, string> = {
  ideal: "Ideal",
  good: "Good",
  acceptable: "Acceptable",
  slow: "Too slow",
};

/** Minutes per hizb for each limit. */
export type BandMinutes = { ideal: number; good: number; acceptable: number };
export const DEFAULT_BAND_MINUTES: BandMinutes = { ideal: 10, good: 15, acceptable: 20 };

/** The three limits in ms for a portion of this size. */
export type BandLimits = { ideal: number; good: number; acceptable: number };

export function bandLimits(hizbEq: number, minutes: BandMinutes = DEFAULT_BAND_MINUTES): BandLimits {
  const ms = (m: number) => Math.round(m * 60_000 * hizbEq);
  return { ideal: ms(minutes.ideal), good: ms(minutes.good), acceptable: ms(minutes.acceptable) };
}

export function bandOf(ms: number, hizbEq: number, minutes: BandMinutes = DEFAULT_BAND_MINUTES): Band {
  const l = bandLimits(hizbEq, minutes);
  if (ms <= l.ideal) return "ideal";
  if (ms <= l.good) return "good";
  if (ms <= l.acceptable) return "acceptable";
  return "slow";
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "m:ss", or "h:mm:ss" once past 59:59. Whole seconds, rounded down. */
export function formatClock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "Ideal ≤ 20:00": a band's limit as the targets line reads. */
export function formatLimit(band: Exclude<Band, "slow">, limitMs: number): string {
  return `${BAND_LABEL[band]} ≤ ${formatClock(limitMs)}`;
}

/**
 * How each band looks, from app tokens only (globals.css).
 * - `pill`: Tailwind classes for a band pill (Ideal solid, the rest at the
 *   app's /15 status-pill strength).
 * - `fill` / `stroke`: SVG paint for a chart bar or band bar.
 * - `text`: the colour for text drawn ON `fill`.
 * Ideal is solid --ok with light text (--card is white in light mode and
 * navy in dark, where --ok turns light green, so it keeps its contrast).
 */
export const BAND_TONE: Record<Band, { pill: string; fill: string; stroke: string; text: string }> = {
  ideal: { pill: "bg-ok text-card", fill: "var(--ok)", stroke: "var(--ok)", text: "var(--card)" },
  good: {
    pill: "bg-ok/15 text-ok",
    fill: "color-mix(in oklab, var(--ok) 30%, var(--card))",
    stroke: "var(--ok)",
    text: "var(--ok)",
  },
  acceptable: { pill: "bg-warn/15 text-warn", fill: "var(--warn)", stroke: "var(--warn)", text: "var(--card)" },
  slow: { pill: "bg-danger/15 text-danger", fill: "var(--danger)", stroke: "var(--danger)", text: "var(--card)" },
};
