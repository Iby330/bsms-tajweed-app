/**
 * The listener screen's pure logic: what the rail, the mushaf and the
 * pickers show for a given state. No React and no server imports, so it can
 * be unit-tested and used from any client component.
 */
import { bandLimits, bandOf, BAND_LABEL, formatClock, type Band, type BandMinutes } from "@/lib/murajaah/bands";
import { autoCheckpoints, stretchesOf } from "@/lib/murajaah/checkpoints";
import type { ClockFields } from "@/lib/murajaah/clock";
import {
  firstPageOf, hizbInfo, inRanges, juzInfo, normaliseSelection, surahInfo,
  type PortionKind, type VerseRange,
} from "@/lib/murajaah/portions";
import { MARK_CATEGORIES, type CheckpointView, type MarkCategory, type MarkLocation, type MarkView } from "@/lib/murajaah/sessions";
import { ayahKey, markKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";

export type Selection = { kind: PortionKind; ns: number[] };

const LAST_PAGE = 604;

/**
 * The pages the selection covers, for the pager. The last page is where the
 * last unit ends: a surah's own last page, or the page the next hizb/juz
 * starts on (the end of this one can share it).
 */
export function pageRangeOf(kind: PortionKind, ns: readonly number[]): { first: number; last: number } {
  const sorted = normaliseSelection(kind, ns);
  const n = sorted[sorted.length - 1];
  let last = LAST_PAGE;
  if (kind === "surah") last = surahInfo(n).pages[1];
  else if (kind === "hizb" && n < 60) last = hizbInfo(n + 1).page;
  else if (kind === "juz" && n < 30) last = juzInfo(n + 1).page;
  return { first: firstPageOf(kind, sorted), last };
}

/** Dimmed and untappable: the classes MushafReader's `heat` puts on a word. */
export const OUTSIDE_CLASS = "opacity-30 pointer-events-none";

/** `heat` for MushafReader: every ayah on these pages outside the selection, by ayah key. */
export function dimHeat(pages: readonly MushafPage[], ranges: readonly VerseRange[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pages) {
    for (const ln of p.lines) {
      for (const w of ln.words) {
        if (!inRanges(ranges, w.surah, w.ayah)) out[ayahKey(w)] = OUTSIDE_CLASS;
      }
    }
  }
  return out;
}

/** A tapped token's target: the end marker is the whole ayah. */
export function locationOf(w: Pick<QuranWord, "surah" | "ayah" | "position" | "isEnd">): MarkLocation {
  return { surah: w.surah, ayah: w.ayah, position: w.isEnd ? null : w.position };
}

/** The mark already on this word or ayah, if any. */
export function markAt(marks: readonly MarkView[], loc: MarkLocation): MarkView | undefined {
  return marks.find((m) => m.surah === loc.surah && m.ayah === loc.ayah && m.position === loc.position);
}

/** MushafReader's `marks`: placed marks by markKey (+1 marks have no place). */
export function markMap(marks: readonly MarkView[]): Record<string, { category: string }> {
  const out: Record<string, { category: string }> = {};
  for (const m of marks) {
    if (m.surah === null || m.ayah === null) continue;
    out[markKey({ surah: m.surah, ayah: m.ayah, position: m.position })] = { category: m.category ?? "" };
  }
  return out;
}

/** What Undo removes: the last mark added. */
export function latestMark(marks: readonly MarkView[]): MarkView | null {
  return marks.length ? marks[marks.length - 1] : null;
}

/** Makhraj is refused on a whole-ayah mark (the DB says so too). */
export function allowedCategories(m: Pick<MarkView, "surah" | "position">): MarkCategory[] {
  const wholeAyah = m.surah !== null && m.position === null;
  return MARK_CATEGORIES.filter((c) => !(wholeAyah && c === "makhraj"));
}

export const CATEGORY_LABEL: Record<MarkCategory, string> = {
  hifz: "Hifdh", tajweed: "Tajweed", makhraj: "Makhraj", fluency: "Fluency",
};

/** Changing the reciter or portion would throw something away. */
export function isDirty(clock: ClockFields, marks: readonly unknown[], checkpoints: readonly unknown[]): boolean {
  return !!clock.timer_started_at || marks.length > 0 || checkpoints.length > 0;
}

export type CheckpointRow = {
  /** The stored checkpoint's id; null while it is still to tick. */
  id: string | null;
  kind: "auto" | "added";
  state: "done" | "next" | "pending";
  ord: number;
  label: string;
  sub: string;
  short: string;
  tag: string;
  /** Done: its split. */
  splitMs: number | null;
  /** Next: the time since the previous auto tick, live. */
  liveMs: number | null;
  band: Band | null;
  mistakes: number;
  canUntick: boolean;
  /** Ticked at, on the session clock. */
  atMs: number | null;
  /** The page to turn to on ticking it. */
  nextPage: number | null;
};

/**
 * The rail's checkpoint list: ticked ones (automatic and added) in time
 * order with their splits, then the ones still to tick, the first of them
 * "next" and timed live. Only the latest automatic tick, or any added one,
 * can be unticked.
 */
export function checkpointRows(input: {
  kind: PortionKind;
  ns: readonly number[];
  checkpoints: readonly CheckpointView[];
  markAts: readonly number[];
  nowMs: number;
  started: boolean;
  minutes: BandMinutes;
}): CheckpointRow[] {
  const { kind, ns, checkpoints, markAts, nowMs, started, minutes } = input;
  const autos = autoCheckpoints(kind, ns);
  const byOrd = new Map(autos.map((a) => [a.ord, a]));
  const sorted = [...checkpoints].sort((a, b) => a.atMs - b.atMs || a.ord - b.ord);
  const stretches = stretchesOf({
    kind, ns, markAts, endMs: null, minutes,
    ticked: sorted.map((c) => ({ kind: c.kind, ord: c.ord, label: c.label, atMs: c.atMs })),
  });
  const latestAutoOrd = Math.max(0, ...sorted.filter((c) => c.kind === "auto").map((c) => c.ord));
  const added = sorted.filter((c) => c.kind === "added");

  const rows: CheckpointRow[] = sorted.map((c, i) => {
    const s = stretches[i];
    const a = c.kind === "auto" ? byOrd.get(c.ord) : undefined;
    const n = added.indexOf(c) + 1;
    return {
      id: c.id, kind: c.kind, state: "done", ord: c.ord,
      label: a?.label ?? c.label,
      sub: `ticked at ${formatClock(c.atMs)}`,
      short: a?.short ?? `CP${n}`,
      tag: a?.tag ?? formatClock(c.atMs),
      splitMs: s.ms, liveMs: null, band: s.band, mistakes: s.mistakes,
      canUntick: c.kind === "added" || c.ord === latestAutoOrd,
      atMs: c.atMs, nextPage: a?.nextPage ?? null,
    };
  });

  const ticked = new Set(sorted.filter((c) => c.kind === "auto").map((c) => c.ord));
  const lastAutoAt = Math.max(0, ...sorted.filter((c) => c.kind === "auto").map((c) => c.atMs));
  let first = true;
  for (const a of autos) {
    if (ticked.has(a.ord)) continue;
    const next = first;
    first = false;
    const live = next && started ? Math.max(0, nowMs - lastAutoAt) : null;
    rows.push({
      id: null, kind: "auto", state: next ? "next" : "pending", ord: a.ord,
      label: a.label, sub: a.sub, short: a.short, tag: a.tag,
      splitMs: null, liveMs: next ? (live ?? 0) : null,
      band: live !== null ? bandOf(live, a.scale, minutes) : null,
      mistakes: 0, canUntick: false, atMs: null, nextPage: a.nextPage,
    });
  }
  return rows;
}

/**
 * The band bar under the timer: segments ideal : good : acceptable : slow,
 * the slow one as long as the acceptable one, and the marker's position.
 */
export function bandBar(ms: number, hizbEq: number, minutes: BandMinutes) {
  const l = bandLimits(hizbEq, minutes);
  const end = l.acceptable + (l.acceptable - l.good);
  const pct = (x: number) => Math.round((x / end) * 1000) / 10;
  return {
    widths: [pct(l.ideal), pct(l.good - l.ideal), pct(l.acceptable - l.good), pct(end - l.acceptable)],
    markerPct: Math.min(100, pct(ms)),
    ticks: [formatClock(l.ideal), formatClock(l.good), formatClock(l.acceptable)],
  };
}

/** "Ideal until 10:00 · 6:00 left", or "Past 20:00: too slow". */
export function timeHint(ms: number, hizbEq: number, minutes: BandMinutes): string {
  const l = bandLimits(hizbEq, minutes);
  const band = bandOf(ms, hizbEq, minutes);
  if (band === "slow") return `Past ${formatClock(l.acceptable)}: too slow`;
  const limit = l[band];
  return `${BAND_LABEL[band]} until ${formatClock(limit)} · ${formatClock(limit - ms)} left`;
}

/** The inclusive mistake limit, as the target line reads it. */
export function limitLine(limit: number): string {
  if (limit <= 0) return "no mistakes";
  return `${limit} mistake${limit === 1 ? "" : "s"} or fewer`;
}

/** A click in the portion picker: toggle within a kind, or start over in another. */
export function toggleUnit(sel: Selection, kind: PortionKind, n: number): { sel: Selection; msg: string } {
  if (sel.kind !== kind) {
    const msg = sel.ns.length ? `New ${kind} selection: your ${sel.kind} selection was cleared.` : "";
    return { sel: { kind, ns: [n] }, msg };
  }
  const ns = sel.ns.includes(n) ? sel.ns.filter((x) => x !== n) : [...sel.ns, n].sort((a, b) => a - b);
  return { sel: { kind, ns }, msg: "" };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, "");

/** Surah search: a number prefix, the English name (with or without its article), or Arabic. */
export function surahMatches(s: { n: number; en: string; ar: string }, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (/^\d+$/.test(q)) return String(s.n).startsWith(q);
  const nq = norm(q);
  if (!nq) return false;
  const en = norm(s.en);
  return en.includes(nq) || en.replace(/^(al|an|ar|as|ash|at|az|ad|adh)/, "").startsWith(nq) || s.ar.includes(q);
}

export type Shortcut = "plus" | "undo" | "startPause" | "tick" | "addCheckpoint" | "nextPage" | "prevPage";

/** The rail's keyboard shortcuts. Pages turn as in a mushaf: left is next. */
export function shortcutOf(key: string): Shortcut | null {
  switch (key) {
    case " ": case "m": case "M": return "plus";
    case "z": case "Z": return "undo";
    case "p": case "P": return "startPause";
    case "n": case "N": return "tick";
    case "c": case "C": return "addCheckpoint";
    case "ArrowLeft": return "nextPage";
    case "ArrowRight": return "prevPage";
    default: return null;
  }
}
