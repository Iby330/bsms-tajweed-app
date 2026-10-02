import { notFound } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { getCachedPageWords, getCachedSurahs, getCachedSurahStartPages } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { pageWithin } from "@/lib/quran/page-within";
import { hearingMistakesFor, todaysMarksFor } from "@/lib/hifz/hearing-queries";
import { aggregatePatterns } from "@/lib/hifz/mistakes";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { rosterWithNext, type RosterStudent } from "@/lib/hifz/roster";
import { HearDesk, type DeskStudent } from "./hear-desk";
import { PatternTracker } from "./pattern-tracker";
import { ReviewFeedback } from "./review-feedback";
import { Rule } from "./rule";
import type { SurahNames } from "./mushaf-reader";

/** The seeded mushaf runs An-Nas back to Al-Mulk — pages 562–604. */
const LAST_PAGE = 604;

/**
 * The register's Hear tab: a student picker, the one-page mushaf opening at
 * the chosen student's next surah, every tap saved at once for them, then
 * the picture of their mistakes: recurring ones from teacher hearings, then
 * what their revision partner found. The result (Pass / Not passed) is a
 * separate step on the Overview and the student's page. The URL carries the
 * student (`student`, else the first with a target), the page (`p`) and the
 * partner heatmap's page (`heat`).
 */
export async function HearTab({
  studentParam, p, heat, roster: given,
}: {
  studentParam?: string;
  /** The register has already read it; read here when it is not passed. */
  roster?: RosterStudent[];
  p?: string;
  heat?: string;
}) {
  const roster = given ?? (await rosterWithNext());
  const chosen = studentParam
    ? roster.find((s) => s.id === studentParam)
    : roster.find((s) => s.run.length > 0);
  // A named student off the teacher's roster (another class, an inactive
  // student, a non-student id) is not found rather than shown.
  if (studentParam && !chosen) notFound();

  const deskRoster: DeskStudent[] = roster.map((s) => ({
    id: s.id, name: s.name, next: s.next?.name_en ?? null, hasTarget: s.run.length > 0,
  }));

  if (!chosen) {
    return (
      <div className="field">
        <p className="box c12 note">
          {roster.length ? "No student has a target yet. Set one on the Overview." : "No active students yet."}
        </p>
      </div>
    );
  }

  const studentId = chosen.id;
  const basePath = `/teacher/hifdh?tab=hear&student=${encodeURIComponent(studentId)}`;
  const profile = (await currentProfile())!;
  const [hearingMistakes, today] = await Promise.all([
    hearingMistakesFor(studentId),
    todaysMarksFor(profile.id, studentId),
  ]);

  const mistakePicture = (
    <>
      <Rule label="Teacher hearings" />
      <div className="field">
        <section className="box c12">
          {hearingMistakes.length ? (
            <PatternTracker patterns={aggregatePatterns(hearingMistakes, new Date())} flags={[]} />
          ) : (
            <p className="note">No mistakes marked in a hearing yet.</p>
          )}
        </section>
      </div>

      <Rule label="Partner revision" />
      <ReviewFeedback
        studentId={studentId}
        heat={heat ? Number(heat) : undefined}
        basePath={p ? `${basePath}&p=${p}` : basePath}
      />
    </>
  );

  const run = chosen.run;
  // Named in the URL with no target: nothing to hear, so say so and show
  // the picture only.
  if (!run.length) {
    return (
      <>
        <div className="field">
          <section className="box c12" aria-label="The hearing">
            <HearDesk
              roster={deskRoster} studentId={studentId} studentName={chosen.name}
              initialMistakes={[]} pages={[]} heat={{}} history={{}} surahNames={{}}
            />
          </section>
        </div>
        {mistakePicture}
      </>
    );
  }

  const [startPages, surahs] = await Promise.all([getCachedSurahStartPages(), getCachedSurahs()]);
  // The pages the tab can turn: from the run's last surah's first page
  // through the end of the seeded mushaf. Without ?p, open on the next
  // surah's own first page (a completed run opens on its last).
  const opening = chosen.next?.number ?? run[run.length - 1].number;
  const range = { from: startPages[run[run.length - 1].number], to: LAST_PAGE };
  const page = p ? pageWithin(p, range) : (startPages[opening] ?? range.from);

  const rows = await getCachedPageWords(page);
  const words = rows.map(fromRow);
  // Earlier marks tint underneath; today's are the logger's own marks.
  const earlier = today ? hearingMistakes.filter((m) => m.session_id !== today.id) : hearingMistakes;
  const { heat: heatValues, history } = spreadHeat(words, earlier, new Date());
  const surahNames: SurahNames = Object.fromEntries(surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));

  return (
    <>
      <div className="field">
        <section className="box c12" aria-label="The hearing">
          <HearDesk
            roster={deskRoster}
            studentId={studentId}
            studentName={chosen.name}
            initialMistakes={today?.mistakes ?? []}
            pages={groupIntoPages(words)}
            heat={heatValues}
            history={history}
            surahNames={surahNames}
            pager={{
              page, min: range.from, max: range.to,
              basePath: heat ? `${basePath}&heat=${heat}` : basePath, param: "p",
            }}
          />
        </section>
      </div>
      {mistakePicture}
    </>
  );
}
