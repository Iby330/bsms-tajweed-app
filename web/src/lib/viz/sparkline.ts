/**
 * Sparkline geometry — pure, no DOM.
 *
 * Scaled to the run's own min/max rather than 0–100: across six marks that
 * all sit in the seventies, an absolute scale draws a flat line and says
 * nothing. The point of the line is the shape of the change.
 */
const round = (n: number) => Math.round(n * 100) / 100;

export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): string {
  if (values.length < 2) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerH = Math.max(0, height - pad * 2);
  const step = width / (values.length - 1);

  return values
    .map((v, i) => {
      const x = round(i * step);
      // A flat run has no span to scale against — sit it on the midline.
      const y = span === 0 ? round(height / 2) : round(pad + innerH * (1 - (v - min) / span));
      return `${x},${y}`;
    })
    .join(" ");
}

export type Trend = "up" | "down" | "flat";

/** First mark to last. Sub-point moves are noise, not a trend. */
export function trendOf(values: number[]): Trend {
  if (values.length < 2) return "flat";
  const delta = values[values.length - 1] - values[0];
  if (Math.abs(delta) < 0.5) return "flat";
  return delta > 0 ? "up" : "down";
}
