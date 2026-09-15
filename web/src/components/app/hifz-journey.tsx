import Link from "next/link";
import { cn } from "@/lib/utils";
import { hizbOf, HIZB_BOUNDS } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import type { Surah } from "@/lib/hifz/pace";

type Rec = { passed_at: string; teacher_comment: string | null };

/**
 * The year as a mushaf index.
 *
 * Thirty-odd surahs read faster as a grid than as a path: the whole run is
 * one shape, and the Arabic does the naming. Cells are grouped into their
 * hizb bands — the standard division, from HIZB_BOUNDS — so the structure a
 * student is actually assessed on is visible rather than implied.
 *
 * Two things the earlier path got wrong and this fixes:
 *  · the pace marker was an unlabelled rule. Nobody could know what it meant,
 *    so it now says "expected here by now" in words.
 *  · comments lived in a separate record below, which meant the grid could
 *    not tell you where feedback existed. A speech mark on the cell does.
 *
 * A cell links to that surah's own page. The introductions run to thousands
 * of words, so they get somewhere to live rather than an expanding panel that
 * pushes the grid around and cannot be linked to.
 *
 * A returning student's earlier years sit above this year, in the same
 * grid. `earlier` is the run before their start_surah: passed, but usually
 * carrying no hifz_records, since records only begin at start_surah — so a
 * cell is done when it is in `earlier` OR has a record. A hizb split across
 * two years lands in one band, because groups follow contiguous runs. A hizb
 * finished before this year never offers its check; that was sat last year.
 *
 * Each hizb folds. A student does not need forty surah cells in view to see
 * where they are; they need the band they are working in. The band is a
 * native <details>/<summary>, so it folds before hydration and from the
 * keyboard with no script. Open by default: the hizb holding the next
 * surah, and the one carrying the pace marker — a warning that they are
 * behind must never sit hidden inside a closed fold.
 */
export function HifzJourney({
  list,
  earlier = [],
  records,
  expected,
}: {
  list: Surah[];
  earlier?: Surah[];      // previous years' surahs, passed, usually recordless
  records: Map<number, Rec>;
  expected: number;
}) {
  if (list.length === 0) return null;

  const passedCount = list.filter((s) => records.has(s.number)).length;
  const currentIdx = list.findIndex((s) => !records.has(s.number)); // -1 → all passed
  // Omitted when there is no expectation yet, when it lands on the surah the
  // student is already on, or when they are exactly on pace — the chip in the
  // overview says that better than a rule does.
  const rawMarker = expected > 0 ? Math.min(expected, list.length) - 1 : null;
  const markerIdx =
    rawMarker !== null && currentIdx !== -1 && rawMarker !== currentIdx && expected !== passedCount
      ? rawMarker
      : null;

  // Contiguous hizb groups over the earlier years and this one. `i` is the
  // index into THIS year's list, and null for an earlier year — which is what
  // keeps "next" and the pace marker, both indexes into `list`, off cells
  // that are not this year's.
  type Item = { s: Surah; i: number | null };
  const cells: Item[] = [
    ...earlier.map((s) => ({ s, i: null })),
    ...list.map((s, i) => ({ s, i })),
  ];
  const groups: { hizb: number; items: Item[] }[] = [];
  cells.forEach((item) => {
    const h = hizbOf(item.s.number);
    if (h === null) return;
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.items.push(item);
    else groups.push({ hizb: h, items: [item] });
  });
  const isDone = (item: Item) => item.i === null || records.has(item.s.number);

  return (
    <section className="box c12 hifzindex" aria-label="Your surahs">
      {groups.map((g) => {
        const bound = HIZB_BOUNDS.find((b) => b.hizb === g.hizb);
        const inHizb = bound ? bound.to - bound.from + 1 : g.items.length;
        const done = g.items.filter(isDone).length;
        // "Ready" only when the WHOLE hizb is here and passed — a partial hizb
        // can never be checked, so it must not claim to be — AND at least one
        // of its surahs was passed THIS year. A hizb finished before this year
        // had its check then.
        const ready =
          done === g.items.length &&
          g.items.length === inHizb &&
          g.items.some((x) => x.i !== null && records.has(x.s.number));
        const holdsCurrent = g.items.some((x) => x.i !== null && x.i === currentIdx);
        const holdsMarker =
          markerIdx !== null && g.items.some((x) => x.i !== null && x.i === markerIdx);
        return (
          <details key={g.hizb} open={holdsCurrent || holdsMarker}>
            <summary className="band" aria-label={`Hizb ${g.hizb}, ${done} of ${g.items.length} passed`}>
              <svg className="chev" viewBox="0 0 24 24" aria-hidden>
                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="t">Hizb {g.hizb}</span>
              <span className="r" />
              <span className={cn("st", !ready && "wait")}>
                {done} of {g.items.length}
                {ready && " · ready for your check"}
              </span>
            </summary>

            <div className="index">
              {g.items.map((item) => {
                const { s, i } = item;
                const rec = records.get(s.number);
                const meta = SURAH_META[s.number];
                const isNext = i !== null && i === currentIdx;
                return (
                  <Link
                    key={s.number}
                    href={`/hifz/${s.number}`}
                    className={cn("cell", isDone(item) && "done", isNext && "next")}
                  >
                    {/* Numbered by position in the whole run, not in this
                        year's slice, so a returning student's second year
                        carries on counting instead of restarting at 01. For a
                        student who starts at the beginning the two are the
                        same number. */}
                    <span className="n">{String(s.order_index).padStart(2, "0")}</span>
                    {isNext && <span className="tag">NEXT</span>}
                    {rec?.teacher_comment && (
                      <span className="cmt" title="Your teacher left a comment">
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
                        </svg>
                        {/* The glyph alone is a hover affordance, which a
                            screen reader never gets. The old record list read
                            comments out in full; the least this owes is to
                            say one exists. */}
                        <span className="sr-only">Your teacher left a comment</span>
                      </span>
                    )}
                    <span dir="rtl" lang="ar" className="ar-quran">{s.name_ar}</span>
                    <span className="en">
                      {s.name_en}
                      {meta && <span className="sr-only">, {meta.meaning}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>

            {holdsMarker && (
              <div className="paceline">
                <span className="t">Expected here by now</span>
                <span className="r" />
              </div>
            )}
          </details>
        );
      })}

    </section>
  );
}
