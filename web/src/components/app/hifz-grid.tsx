import Link from "next/link";
import { hizbOf, HIZB_BOUNDS } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { cn } from "@/lib/utils";

export type MarkRow = {
  number: number;
  name_en: string;
  name_ar: string;
  passed: boolean;
  /** covered by a submitted hearing but not passed — the third state, redo */
  heard: boolean;
  comment: string | null;
  /** date, or null when the surah has no record yet */
  passedAt: string | null;
};

/**
 * The teacher's view of the run — the student's own mushaf index, each
 * cell a door.
 *
 * The teacher used to sign surahs off down a list of forty-odd rows, which
 * gave away the one thing the student's view has: the run as a single shape,
 * banded by hizb, so where a student actually is takes no reading. This is
 * that grid, and the same page now looks like the page the student is
 * looking at when they talk about it.
 *
 * A cell links to the surah's page, which is where a surah is heard: the
 * mushaf, the marks, the verdict. The sign-off panel that used to open
 * under a band is gone — passing a surah follows a hearing, and two places
 * to mark the same surah is how records drift.
 *
 * A row can also be heard, not passed: a submitted hearing covered it but
 * left no record, so it needs redoing — a third state, drawn red, that a
 * plain passed/unpassed row could not tell the teacher apart from unheard.
 *
 * Server component: nothing here needs state any more.
 */
export function HifzGrid({
  studentId,
  rows,
  expected,
}: {
  studentId: string;
  rows: MarkRow[];
  expected: number;
}) {
  if (rows.length === 0) return null;

  const passedCount = rows.filter((r) => r.passed).length;
  const currentIdx = rows.findIndex((r) => !r.passed); // -1 → whole run passed
  // Same rule as the student's view: no marker before there is an expectation,
  // none when it lands on the surah they are already on, none when on pace.
  const rawMarker = expected > 0 ? Math.min(expected, rows.length) - 1 : null;
  const markerIdx =
    rawMarker !== null && currentIdx !== -1 && rawMarker !== currentIdx && expected !== passedCount
      ? rawMarker
      : null;

  // Contiguous hizb groups over the run, each item keeping its global index.
  const groups: { hizb: number; items: { r: MarkRow; i: number }[] }[] = [];
  rows.forEach((r, i) => {
    const h = hizbOf(r.number);
    if (h === null) return;
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.items.push({ r, i });
    else groups.push({ hizb: h, items: [{ r, i }] });
  });

  return (
    <section className="box c12 hifzindex" aria-label="Hifdh run">
      <p className="note">Open a surah to hear it, or to see how it was heard.</p>

      {groups.map((g) => {
        const bound = HIZB_BOUNDS.find((b) => b.hizb === g.hizb);
        const inHizb = bound ? bound.to - bound.from + 1 : g.items.length;
        const done = g.items.filter((x) => x.r.passed).length;
        // "Ready for the check" only when the WHOLE hizb is on this student's
        // run and passed — a partial hizb can never be checked.
        const ready = done === g.items.length && g.items.length === inHizb;

        return (
          <div key={g.hizb}>
            <div className="band">
              <span className="t">Hizb {g.hizb}</span>
              <span className="r" />
              <span className={cn("st", !ready && "wait")}>
                {done} of {g.items.length}
                {ready && " · ready for the check"}
              </span>
            </div>

            <div className="index">
              {g.items.map(({ r, i }) => {
                const meta = SURAH_META[r.number];
                return (
                  <Link
                    key={r.number}
                    href={`/teacher/hifdh/${studentId}/${r.number}`}
                    // The surah page is force-dynamic with real Supabase reads;
                    // left to prefetch, a 43-cell grid would fire most of them
                    // on viewport alone.
                    prefetch={false}
                    className={cn(
                      "cell",
                      r.passed && "done",
                      !r.passed && r.heard && "redo",
                      i === currentIdx && "next",
                    )}
                  >
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    {i === currentIdx && <span className="tag">NEXT</span>}
                    {r.comment && (
                      <span className="cmt" aria-hidden>
                        <svg viewBox="0 0 24 24">
                          <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
                        </svg>
                      </span>
                    )}
                    <span dir="rtl" lang="ar" className="ar-quran">{r.name_ar}</span>
                    <span className="en">
                      {r.name_en}
                      <span className="sr-only">
                        {meta && `, ${meta.meaning}`}
                        {r.passed ? ", signed off" : ", not signed off"}
                        {!r.passed && r.heard && ", heard, not passed"}
                        {r.comment && ", has a comment"}
                      </span>
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
