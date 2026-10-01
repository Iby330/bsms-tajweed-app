import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedPageWords, getCachedSurahs, getCachedSurahStartPages } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { pageWithin } from "@/lib/quran/page-within";
import { hearingMistakesFor, hearingsForStudent, openDraftFor } from "@/lib/hifz/hearing-queries";
import { doneLine } from "@/lib/hifz/hearings";
import { startHearing } from "@/lib/hifz/hearing-actions";
import { aggregatePatterns } from "@/lib/hifz/mistakes";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { rosterWithNext } from "@/lib/hifz/roster";
import { HearPanel, type PanelStudent } from "./hear-panel";
import { PatternTracker } from "./pattern-tracker";
import { ReviewFeedback } from "./review-feedback";
import { Rule } from "./rule";
import type { SurahNames } from "./mushaf-reader";

/** The seeded mushaf runs An-Nas back to Al-Mulk — pages 562–604. */
const LAST_PAGE = 604;

/**
 * A student's Hear tab: the one place a teacher hears them. The hearing on
 * top (Start hearing with a planned range, tap as they recite on the same
 * one-page mushaf and pager as everywhere, End hearing once), then the
 * picture of their mistakes: recurring ones from teacher hearings, then
 * what their revision partner found. Peer and teacher marks stay apart.
 * The URL carries the default start (`from`), the page (`p`), the hearing
 * just confirmed (`done`) and the partner heatmap's page (`heat`).
 */
export async function HearTab({
  studentId, studentName, fromParam, doneParam, p, heat,
}: {
  studentId: string;
  studentName: string;
  fromParam?: string;
  doneParam?: string;
  p?: string;
  heat?: string;
}) {
  const basePath = `/teacher/hifdh/${studentId}?tab=hear`;
  const [roster, hearingMistakes] = await Promise.all([rosterWithNext(), hearingMistakesFor(studentId)]);
  const chosen = roster.find((s) => s.id === studentId);
  const run = chosen?.run ?? [];

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

  // No target yet: nothing to hear, so say so and show the picture only.
  if (!run.length) {
    return (
      <>
        <div className="field">
          <p className="box c12 note">No target set for this student yet.</p>
        </div>
        {mistakePicture}
      </>
    );
  }

  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const [draft, allHearings, { data: records }, startPages, surahs] = await Promise.all([
    openDraftFor(profile.id, studentId),
    hearingsForStudent(studentId),
    db.from("hifz_records").select("surah_number, passed_at").eq("student_id", studentId),
    getCachedSurahStartPages(),
    getCachedSurahs(),
  ]);

  // The start: the open draft's, else ?from when it is on the run, else the
  // next surah, and a student whose run is complete starts at its last.
  const requested = Number(fromParam);
  const from = draft?.from
    ?? (run.some((s) => s.number === requested) ? requested : (chosen?.next?.number ?? run[run.length - 1].number));
  const minEnd = run[run.length - 1].number;

  // The pages the tab can turn: from the run's last surah's first page
  // through the end of the seeded mushaf. Without ?p, open on the start
  // surah's own first page rather than the range's minimum.
  const range = { from: startPages[minEnd], to: LAST_PAGE };
  const page = p ? pageWithin(p, range) : (startPages[from] ?? range.from);

  const rows = await getCachedPageWords(page);
  const words = rows.map(fromRow);
  const { heat: heatValues, history } = spreadHeat(words, hearingMistakes, new Date());
  const surahNames: SurahNames = Object.fromEntries(surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));
  const passedBefore: Record<number, string> = Object.fromEntries((records ?? []).map((r) => [r.surah_number, r.passed_at]));

  // The line after Confirm: the hearing named in ?done, described from what it wrote.
  const justDone = doneParam ? allHearings.find((h) => h.id === doneParam) : undefined;
  const done = justDone
    ? { text: doneLine(justDone.from, justDone.to, new Set(Object.keys(passedBefore).map(Number)), surahNames) }
    : null;

  const panelRoster: PanelStudent[] = roster.map((s) => ({ id: s.id, name: s.name, hasTarget: s.run.length > 0 }));
  const query = [fromParam ? `from=${from}` : "", heat ? `heat=${heat}` : ""].filter(Boolean).join("&");

  return (
    <>
      <div className="field">
        <section className="box c12" aria-label="The hearing">
          <HearPanel
            roster={panelRoster}
            studentId={studentId}
            studentName={studentName}
            // A draft keys the logger; with none, the latest hearing does, so
            // a Confirm (which makes the just-submitted hearing the latest)
            // always comes back to a fresh logger.
            loggerKey={draft?.id ?? `new:${allHearings[0]?.id ?? "none"}`}
            sessionId={draft?.id ?? null}
            initialMistakes={draft?.mistakes ?? []}
            pages={groupIntoPages(words)}
            heat={heatValues}
            history={history}
            surahNames={surahNames}
            pager={{ page, min: range.from, max: range.to, basePath: query ? `${basePath}&${query}` : basePath, param: "p" }}
            hearing={{
              from,
              plannedTo: draft?.to,
              minEnd,
              run: run.map((s) => ({ number: s.number, name: s.name_en })),
              passedBefore,
            }}
            firstPages={Object.fromEntries(run.map((s) => [s.number, startPages[s.number]]))}
            start={startHearing.bind(null, studentId)}
            done={done}
          />
        </section>
      </div>
      {mistakePicture}
    </>
  );
}
