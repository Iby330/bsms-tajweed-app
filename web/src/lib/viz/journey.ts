/**
 * Hifz journey geometry — pure, no DOM.
 *
 * Surahs are laid out along a gentle wave rather than a straight bar: the
 * memorisation list is a road a student walks down over a year, and a curve
 * reads as distance travelled in a way a progress bar does not.
 */
export type JourneyNode = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;

export function journeyNodes(count: number, width: number, height: number): JourneyNode[] {
  if (count <= 0) return [];

  const pad = 6;
  const innerW = Math.max(0, width - pad * 2);
  const mid = height / 2;
  // Leave the padding clear at the extremes of the wave so nodes never clip.
  const amp = Math.max(0, height / 2 - pad);

  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return {
      x: round(pad + innerW * t),
      y: round(mid - Math.sin(t * Math.PI * 1.5) * amp * 0.7),
    };
  });
}
