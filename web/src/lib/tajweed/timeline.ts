/**
 * The schedule the hero runs on: when the ball lands, when a rule lights, when
 * one section hands over to the next.
 *
 * Kept apart from the component and free of Remotion imports so it can be read
 * — and if it ever matters, tested — without a renderer. Everything here is a
 * pure function of a frame number, which is what makes the piece deterministic:
 * the same frame always produces the same picture, in the Player and in a
 * rendered file alike.
 *
 * Beats are written in SECONDS and converted once, so the frame rate can change
 * without retuning anything. It is 120, not the 30 it started at: at 30 a hop
 * moved the ball about 100px per frame on a desktop hero, and on a 60 or
 * 120Hz screen that stepped visibly — the single biggest reason the first
 * version read as stiff. 120 matches ProMotion and high-refresh displays; the
 * Player derives each frame from elapsed time, so a 60Hz phone simply shows
 * every other one at no extra cost.
 */

import baked from "./maidah95.geometry.json";

export const FPS = 120;
const s = (seconds: number) => Math.round(seconds * FPS);

/* ── beats ────────────────────────────────────────────────────────────────
 * The ball never stops. It lands and rebounds in one motion, like the
 * bouncing ball over karaoke lyrics, and the rhythm is one word per BEAT. The
 * first version parked the ball for a quarter of a second on every word and
 * then set off again, and velocity dropping to zero at each landing is what
 * made it look mechanical. The reader still gets their time with each word:
 * the lit letters stay lit through the whole hop away and only fade as the
 * ball comes down on the next one.
 */

/** Ball falls in, under gravity, onto the first word of a section. */
const LEAD = s(0.5);
/** Landing to landing. */
const BEAT = s(0.62);
/** After the last word: the ball rebounds up and away. */
const TAIL = s(0.7);
/**
 * One section out, then the next in — in sequence, never overlapping. A
 * crossfade put two half-transparent Arabic lines on top of each other for a
 * moment, which reads as a smudge, not a transition.
 */
export const HANDOVER = s(1.1);
/** Share of the handover spent fading out; the same again fading in. */
export const HANDOVER_OUT = 0.42;
/** Share where the next section starts to appear (a brief empty beat between). */
export const HANDOVER_IN = 0.52;

/** How high the ball arcs between words, as a share of the hop's width. */
export const ARC = 0.34;
/** Floor and ceiling on that lift in font units: a short hop still reads as a
 *  hop, and a long one does not fly off screen. */
export const ARC_MIN = 420;
export const ARC_MAX = 880;

export type WordBeat = {
  word: number;
  /** Frame the ball touches down on this word. */
  land: number;
};

export type SectionBeat = {
  section: number;
  /** First frame this section is on screen, including its lead-in. */
  start: number;
  /** Frame the section begins handing over. */
  end: number;
  beats: WordBeat[];
};

export type Timeline = {
  sections: SectionBeat[];
  /** Length of one full pass, after which the loop repeats seamlessly. */
  durationInFrames: number;
};

export function buildTimeline(): Timeline {
  const sections: SectionBeat[] = [];
  let f = 0;

  baked.sections.forEach((sec, si) => {
    const start = f;
    f += LEAD;
    const beats: WordBeat[] = sec.words.map((_, i) => ({ word: i, land: f + i * BEAT }));
    f += (sec.words.length - 1) * BEAT + TAIL;
    sections.push({ section: si, start, end: f, beats });
    f += HANDOVER;
  });

  return { sections, durationInFrames: f };
}

export const TIMELINE = buildTimeline();

/** Which section is on screen, and how far into its handover we are (0–1). */
export function sectionAt(frame: number) {
  const d = TIMELINE.durationInFrames;
  const t = ((frame % d) + d) % d;
  for (let i = 0; i < TIMELINE.sections.length; i++) {
    const sec = TIMELINE.sections[i];
    const next = TIMELINE.sections[(i + 1) % TIMELINE.sections.length];
    if (t >= sec.start && t < sec.end) return { current: sec, next, handover: 0, t };
    if (t >= sec.end && t < sec.end + HANDOVER) {
      return { current: sec, next, handover: (t - sec.end) / HANDOVER, t };
    }
  }
  const last = TIMELINE.sections[TIMELINE.sections.length - 1];
  return { current: last, next: TIMELINE.sections[0], handover: 1, t };
}

/**
 * What the ball is doing at time `t` within its section.
 *
 *  · "drop"  — falling onto the first word; `p` runs 0→1 to the landing.
 *  · "hop"   — in flight between two words; `p` runs 0→1 from take-off (which
 *              IS the previous landing) to the next landing.
 *  · "exit"  — rebounding off the last word and away; `p` runs 0→1.
 *
 * The caller turns `p` into a position with real projectile motion — constant
 * horizontal speed, parabolic height — rather than an eased slide.
 */
export type BallState =
  | { phase: "drop"; word: number; p: number }
  | { phase: "hop"; from: number; to: number; p: number }
  | { phase: "exit"; word: number; p: number };

export function ballAt(sec: SectionBeat, t: number): BallState {
  const { beats } = sec;
  const first = beats[0];
  const last = beats[beats.length - 1];

  if (t < first.land) {
    return { phase: "drop", word: first.word, p: clamp01(1 - (first.land - t) / LEAD) };
  }
  if (t >= last.land) {
    return { phase: "exit", word: last.word, p: clamp01((t - last.land) / TAIL) };
  }
  for (let i = 0; i < beats.length - 1; i++) {
    const a = beats[i];
    const b = beats[i + 1];
    if (t < b.land) {
      return { phase: "hop", from: a.word, to: b.word, p: (t - a.land) / (b.land - a.land) };
    }
  }
  return { phase: "exit", word: last.word, p: 1 };
}

/** Seconds from `t` to the nearest landing, signed (negative = still to come). */
export function secondsFromLanding(sec: SectionBeat, t: number): number {
  let best = Infinity;
  for (const b of sec.beats) {
    const d = t - b.land;
    if (Math.abs(d) < Math.abs(best)) best = d;
  }
  return best / FPS;
}

/* ── rule lighting ─────────────────────────────────────────────────────────
 * A rule lights as the ball comes down on the FIRST word it covers and stays
 * lit until the ball comes down on the word after its LAST one. That keeps a
 * rule spanning two words — idgham, ikhfa' and iqlab across a boundary — lit
 * as one thing across the hop, and gives every word its full beat of colour.
 */

const LIGHT_IN = s(0.12);
const LIGHT_OUT = s(0.24);

/** 0 → 1 → 0 for one rule at time `t` within its section. */
export function ruleIntensity(sec: SectionBeat, t: number, words: number[]): number {
  if (!words.length) return 0;
  const lo = Math.min(...words);
  const hi = Math.max(...words);
  const first = sec.beats[lo];
  const afterLast = sec.beats[hi + 1];
  if (!first) return 0;

  const on = first.land;
  const off = afterLast ? afterLast.land : sec.end;
  if (t < on - LIGHT_IN || t > off) return 0;

  const rise = clamp01((t - (on - LIGHT_IN)) / LIGHT_IN);
  const fall = clamp01((off - t) / LIGHT_OUT);
  return Math.min(rise, fall);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Seconds, for anyone reading the numbers above and wondering. */
export const DURATION_SECONDS = TIMELINE.durationInFrames / FPS;
