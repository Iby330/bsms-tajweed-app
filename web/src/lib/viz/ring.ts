/**
 * Ring geometry — pure, no DOM.
 *
 * An SVG arc is drawn by dashing the circle to its own circumference and then
 * offsetting that dash: offset === circumference means nothing drawn, 0 means
 * the whole ring. Keeping the arithmetic here means the component stays a
 * render function and the clamping rules are testable on their own.
 */
export type RingGeometry = {
  circumference: number;
  /** stroke-dashoffset for the value. */
  offset: number;
  /** The clamped percentage, or null when there is nothing to draw. */
  pct: number | null;
};

export function ringGeometry(value: number | null | undefined, radius: number): RingGeometry {
  const circumference = 2 * Math.PI * radius;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { circumference, offset: circumference, pct: null };
  }
  const pct = Math.max(0, Math.min(100, value));
  return { circumference, offset: circumference * (1 - pct / 100), pct };
}
