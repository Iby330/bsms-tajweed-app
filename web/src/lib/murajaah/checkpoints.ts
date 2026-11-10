/**
 * Checkpoints for murāja'ah. Pure and client-safe.
 *
 * Automatic checkpoints, per the spec's table:
 *   one hizb        → its 4 quarters ("Q2 · Al-Balad"), each banded at 0.25
 *   one juz         → 1: the end of its first hizb ("End of Hizb 59")
 *   several hizb    → the end of each hizb except the last
 *   several juz     → the end of every hizb except the last (3 juz → 5)
 *   one surah       → none
 *   several surahs  → the end of each surah except the last
 * A gap between runs reads "End of Juz 28, then Juz 30". The last unit ends
 * at Finish (`finalStretch`). A listener's "Add checkpoint" has no band.
 *
 * A tick means "the reciter has just finished this stretch". Each stretch is
 * banded on its own size.
 */
import { bandOf, type Band, type BandMinutes } from "./bands";
import { hizbEqOf, hizbInfo, juzInfo, normaliseSelection, round2, surahHizbEq, surahInfo, type PortionKind } from "./portions";

export type AutoCheckpoint = {
  /** 1-based position in the automatic list; stored as murajaah_checkpoints.ord. */
  ord: number;
  /** "Q2 · Al-Balad", "End of Hizb 59", "End of Juz 28, then Juz 30", "End of Al-Mulk". */
  label: string;
  /** Where the next part starts: "next: Al-Mujadila 1 (p542)"; for a quarter, "90:1 · page 594". */
  sub: string;
  /** Chip text: "Q1", "H55", "S67". */
  short: string;
  /** The phone's place name: "Al-A'la", "to Al-Jumu'ah", a surah's name. */
  tag: string;
  /** The stretch's size in hizb-equivalents, for its band. */
  scale: number;
  /** The page the stretch opens on. */
  page: number;
  /** The page to turn to on ticking it, or null when nothing follows. */
  nextPage: number | null;
};

/** The stretch after the last automatic checkpoint, which ends at Finish. */
export type FinalStretch = { label: string; sub: string; scale: number | null };

/** Added checkpoints are stored with ord 1000 + n. */
export const ADDED_ORD_BASE = 1000;

/** "Al-A'la 1 (p591)": where a hizb starts, with its ayah when the label lacks one. */
function hizbStartsAt(h: number): string {
  const x = hizbInfo(h);
  let l = x.quarters[0].label;
  if (!/\d$/.test(l)) l += ` ${x.start.split(":")[1]}`;
  return `${l} (p${x.page})`;
}

type Seg = { hizb: number; group: string; groupN: number } | { surah: number; groupN: number };

export function autoCheckpoints(kind: PortionKind, ns: readonly number[]): AutoCheckpoint[] {
  const sorted = normaliseSelection(kind, ns);

  if (kind === "hizb" && sorted.length === 1) {
    const qs = hizbInfo(sorted[0]).quarters;
    return qs.map((q, i) => ({
      ord: q.q,
      label: `Q${q.q} · ${q.label}`,
      sub: `${q.start} · page ${q.page}`,
      short: `Q${q.q}`,
      tag: q.label,
      scale: 0.25,
      page: q.page,
      nextPage: qs[i + 1]?.page ?? null,
    }));
  }

  const segs: Seg[] = [];
  if (kind === "hizb") for (const n of sorted) segs.push({ hizb: n, group: `Hizb ${n}`, groupN: n });
  if (kind === "juz") {
    for (const n of sorted) {
      const [a, b] = juzInfo(n).hizbs;
      segs.push({ hizb: a, group: `Juz ${n}`, groupN: n }, { hizb: b, group: `Juz ${n}`, groupN: n });
    }
  }
  if (kind === "surah") for (const n of sorted) segs.push({ surah: n, groupN: n });

  const out: AutoCheckpoint[] = [];
  segs.forEach((sg, i) => {
    const nx = segs[i + 1];
    if (!nx) return;
    if ("surah" in sg && "surah" in nx) {
      const s = surahInfo(sg.surah);
      const next = surahInfo(nx.surah);
      const gap = nx.groupN !== sg.groupN + 1;
      out.push({
        ord: i + 1,
        label: `End of ${s.en}${gap ? `, then ${next.en}` : ""}`,
        sub: `next: ${next.en} 1 (p${next.pages[0]})`,
        short: `S${s.n}`,
        tag: s.en,
        scale: surahHizbEq(s.n),
        page: s.pages[0],
        nextPage: next.pages[0],
      });
    } else if ("hizb" in sg && "hizb" in nx) {
      const gap = nx.hizb !== sg.hizb + 1;
      out.push({
        ord: i + 1,
        label: gap ? `End of ${sg.group}, then ${nx.group}` : `End of Hizb ${sg.hizb}`,
        sub: `next: ${hizbStartsAt(nx.hizb)}`,
        short: `H${sg.hizb}`,
        tag: `to ${hizbInfo(nx.hizb).quarters[0].label}`,
        scale: 1,
        page: hizbInfo(sg.hizb).page,
        nextPage: hizbInfo(nx.hizb).page,
      });
    }
  });
  return out;
}

export function finalStretch(kind: PortionKind, ns: readonly number[]): FinalStretch {
  const sorted = normaliseSelection(kind, ns);
  const last = sorted[sorted.length - 1];
  if (kind === "hizb" && sorted.length === 1) {
    return { label: "After Q4", sub: "time between the Q4 tick and Finish", scale: null };
  }
  if (kind === "surah") {
    const s = surahInfo(last);
    return sorted.length === 1
      ? { label: s.en, sub: "ends at Finish", scale: surahHizbEq(last) }
      : { label: s.en, sub: "last surah, ends at Finish", scale: surahHizbEq(last) };
  }
  const lastHizb = kind === "hizb" ? last : juzInfo(last).hizbs[1];
  return { label: `Hizb ${lastHizb}`, sub: "last hizb, ends at Finish", scale: 1 };
}

/** The next automatic ord to tick, or null when all are ticked. In order only. */
export function nextAutoOrd(autoCount: number, tickedOrds: readonly number[]): number | null {
  const done = tickedOrds.filter((o) => o < ADDED_ORD_BASE);
  const next = (done.length ? Math.max(...done) : 0) + 1;
  return next <= autoCount ? next : null;
}

/** The ord for a new added checkpoint: 1001, then past any already there. */
export function nextAddedOrd(existingOrds: readonly number[]): number {
  const added = existingOrds.filter((o) => o > ADDED_ORD_BASE);
  return (added.length ? Math.max(...added) : ADDED_ORD_BASE) + 1;
}

export type TickedCheckpoint = { kind: "auto" | "added"; ord: number; label: string; atMs: number };

export type Stretch = {
  kind: "auto" | "added" | "final";
  /** The checkpoint's ord; null for the final stretch. */
  ord: number | null;
  label: string;
  fromMs: number;
  toMs: number;
  ms: number;
  /** Size in hizb-equivalents, or null when it has none (added, or nothing left). */
  scale: number | null;
  band: Band | null;
  mistakes: number;
};

/** Marks in (from, to], counting a mark at 0 in the first stretch. */
function countIn(markAts: readonly number[], from: number, to: number): number {
  return markAts.filter((t) => (from <= 0 ? t >= 0 : t > from) && t <= to).length;
}

/**
 * The splits of a session, in time order:
 *  - each ticked AUTO checkpoint, measured from the previous auto tick (or 0)
 *    and banded on its own scale;
 *  - each ADDED checkpoint, measured from the previous point of either kind,
 *    with no band;
 *  - once finished (`endMs` set), the FINAL stretch from the last auto tick
 *    to Finish, banded on whatever size is left unticked (none left = no band).
 *    It takes `finalStretch`'s label when every auto checkpoint was ticked,
 *    else "To Finish".
 */
export function stretchesOf(input: {
  kind: PortionKind;
  ns: readonly number[];
  ticked: readonly TickedCheckpoint[];
  markAts: readonly number[];
  endMs: number | null;
  minutes: BandMinutes;
}): Stretch[] {
  const { kind, ns, markAts, endMs, minutes } = input;
  const autos = autoCheckpoints(kind, ns);
  const scaleOf = new Map(autos.map((a) => [a.ord, a.scale]));
  const ticked = [...input.ticked].sort((a, b) => a.atMs - b.atMs || a.ord - b.ord);

  const out: Stretch[] = [];
  let lastAuto = 0;
  let lastAny = 0;
  let tickedScale = 0;
  for (const t of ticked) {
    if (t.kind === "auto") {
      const scale = scaleOf.get(t.ord) ?? null;
      const ms = t.atMs - lastAuto;
      out.push({
        kind: "auto", ord: t.ord, label: t.label, fromMs: lastAuto, toMs: t.atMs, ms,
        scale, band: scale === null ? null : bandOf(ms, scale, minutes),
        mistakes: countIn(markAts, lastAuto, t.atMs),
      });
      if (scale !== null) tickedScale += scale;
      lastAuto = t.atMs;
    } else {
      out.push({
        kind: "added", ord: t.ord, label: t.label, fromMs: lastAny, toMs: t.atMs, ms: t.atMs - lastAny,
        scale: null, band: null, mistakes: countIn(markAts, lastAny, t.atMs),
      });
    }
    lastAny = t.atMs;
  }

  if (endMs !== null) {
    const left = round2(hizbEqOf(kind, ns) - tickedScale);
    const scale = left > 0 ? left : null;
    const allTicked = autos.every((a) => ticked.some((t) => t.kind === "auto" && t.ord === a.ord));
    const ms = Math.max(0, endMs - lastAuto);
    out.push({
      kind: "final", ord: null,
      label: allTicked ? finalStretch(kind, ns).label : "To Finish",
      fromMs: lastAuto, toMs: endMs, ms,
      scale, band: scale === null ? null : bandOf(ms, scale, minutes),
      mistakes: countIn(markAts, lastAuto, endMs),
    });
  }
  return out;
}
