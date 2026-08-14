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
 */
export function HifzJourney({
  list,
  records,
  expected,
}: {
  list: Surah[];
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

  // Contiguous hizb groups over the list, each keeping its global index.
  const groups: { hizb: number; items: { s: Surah; i: number }[] }[] = [];
  list.forEach((s, i) => {
    const h = hizbOf(s.number);
    if (h === null) return;
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.items.push({ s, i });
    else groups.push({ hizb: h, items: [{ s, i }] });
  });

  return (
    <section className="box c12" aria-label="Your surahs">
      {groups.map((g) => {
        const bound = HIZB_BOUNDS.find((b) => b.hizb === g.hizb);
        const inHizb = bound ? bound.to - bound.from + 1 : g.items.length;
        const done = g.items.filter((x) => records.has(x.s.number)).length;
        // "Ready" only when the WHOLE hizb is on the student's list and passed —
        // a partial hizb can never be checked, so it must not claim to be.
        const ready = done === g.items.length && g.items.length === inHizb;
        return (
          <div key={g.hizb}>
            <div className="band">
              <span className="t">Hizb {g.hizb}</span>
              <span className="r" />
              <span className={cn("st", !ready && "wait")}>
                {done} of {g.items.length}
                {ready && " · ready for your check"}
              </span>
            </div>

            <div className="index">
              {g.items.map(({ s, i }) => {
                const rec = records.get(s.number);
                const meta = SURAH_META[s.number];
                return (
                  <Link
                    key={s.number}
                    href={`/hifz/${s.number}`}
                    className={cn("cell", rec && "done", i === currentIdx && "next")}
                  >
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    {i === currentIdx && <span className="tag">NEXT</span>}
                    {rec?.teacher_comment && (
                      <span className="cmt" title="Your teacher left a comment" aria-hidden>
                        <svg viewBox="0 0 24 24">
                          <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
                        </svg>
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

            {markerIdx !== null && g.items.some((x) => x.i === markerIdx) && (
              <div className="paceline">
                <span className="t">Expected here by now</span>
                <span className="r" />
              </div>
            )}
          </div>
        );
      })}

    </section>
  );
}
