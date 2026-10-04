/**
 * "Tap the place on the diagram" questions — pure, no IO.
 *
 * Where a sound comes from (its makhraj) is a place, so the answer is picked
 * on a drawing of the mouth and throat rather than from a list of names. It
 * is an ordinary `mcq` underneath: one option per REGION of the drawing,
 * labelled `diagram:<region>`, the right one flagged correct. The drawing
 * (components/app/mouth-diagram.tsx) knows the regions by these ids.
 */

export const REGIONS = {
  nose: "The nose (al-khayshūm)",
  lips: "The lips (ash-shafatān)",
  throat_deep: "The deepest part of the throat",
  throat_middle: "The middle of the throat",
  throat_top: "The top of the throat, nearest the mouth",
  tongue_tip: "The tip of the tongue",
  tongue_middle: "The middle of the tongue",
  tongue_back: "The back of the tongue",
  tongue_sides: "The sides of the tongue",
  mouth_hollow: "The empty space of the mouth and throat (al-jawf)",
} as const;

export type Region = keyof typeof REGIONS;

const LABEL = /^diagram:([a-z_]+)$/;

export function regionOf(label: string): Region | null {
  const m = LABEL.exec(label.trim());
  return m && m[1] in REGIONS ? (m[1] as Region) : null;
}

/** True when these options are places on the diagram rather than answers. */
export function isDiagram(options: { label: string }[] | null | undefined): boolean {
  return !!options && options.length >= 2 && options.every((o) => regionOf(o.label) !== null);
}
