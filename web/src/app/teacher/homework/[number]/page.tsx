import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { homeworkScope, scopedHref } from "@/lib/teacher/scope";
import { ClassFilter } from "@/components/app/class-filter";
import { markSubmission } from "@/lib/marking/actions";
import { parseAutoRubric, parseOptions, parseRubric } from "@/lib/marking/objective";
import { questionStats, scoreSubmissions } from "@/lib/marking/responses";
import { blockTopic } from "@/lib/curriculum/catalogue";
import { moduleTitle } from "@/lib/curriculum/tree";
import { seriesShort } from "@/lib/lessons/series";
import { homeworkLabel } from "@/components/app/homework-row";
import { Crumbs } from "@/components/app/crumbs";
import { MixedText } from "@/components/app/mixed-text";
import { ReviewPanel } from "@/components/app/review-panel";
import { PastAttempts } from "@/components/app/past-attempts";
import { StudentPicker } from "@/components/app/student-picker";
import { ResultsTabs, type ResultsTab } from "@/components/app/results-tabs";
import { ResultsSummary, type SummaryRow } from "@/components/app/results-summary";
import { QuestionBreakdown } from "@/components/app/question-breakdown";

export const dynamic = "force-dynamic";

/**
 * One homework, three ways — the results view, modelled on the Google Forms
 * screen every teacher here already reads.
 *
 *   Summary     how the class did: spread, the questions that cost them marks,
 *               then every student by name.
 *   Question    the paper with the class's answers under each question — the
 *               tally beneath every option, every written answer attributed.
 *   Individual  one student's script, marked, on the same screen the marking
 *               queue opens.
 *
 * Before anyone has handed in there is nothing to summarise and nobody to page
 * through, so the tabs do not appear at all and the page is the paper: the
 * answer key, the mark scheme, and how each question scores. That is the state
 * this page used to be in permanently, and it is still the right one for a week
 * that has not been taught yet.
 *
 * Everything is scoped to one class through `homeworkScope()`, which opens on
 * the teacher's own and filters to any class in their section. Students' answers
 * and marks are the most personal thing on the teacher side, so a demo teacher
 * sees the demo classes and never the programme's hundred and six.
 *
 * ONE page, two ways in. The marking section reaches it by clicking a homework;
 * the curriculum reaches it from the week it belongs to, with `?from=course`,
 * which only changes the trail. It replaced a separate list of every student
 * that lived here — the Summary tab is that list with the marks filled in, and
 * Individual is it with the script attached — because two screens for one
 * homework meant a mark entered on one was a mark missing from the other.
 */
export default async function HomeworkResults({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{
    tab?: string;
    student?: string;
    class?: string;
    from?: string | string[];
  }>;
}) {
  const [{ number }, { tab, student, class: classParam, from }] = await Promise.all([
    params,
    searchParams,
  ]);
  const n = Number(number);
  if (!Number.isFinite(n)) notFound();

  const db = await supabaseServer();
  // The week and the questions hang off this homework by a foreign key, so
  // PostgREST returns the lot in one round trip; the roster is an independent
  // lookup, so it leaves at the same time.
  const [{ data: hw }, scope] = await Promise.all([
    db
      .from("homeworks")
      .select(`
        id, number, title, series, total_marks, due_at, is_graded, week_id,
        weeks(term_id, number),
        questions(id, position, qtype, scoring, prompt, points, is_bonus, is_task, options, rubric, needs_key)
      `)
      .eq("number", n)
      .order("position", { referencedTable: "questions" })
      .maybeSingle(),
    homeworkScope(classParam),
  ]);
  if (!hw) notFound();

  const week = hw.weeks;
  const roster = scope.students;
  const questions = hw.questions ?? [];
  const totalMarks = Number(hw.total_marks);
  const title = moduleTitle(hw.title);
  // Every link out of this page keeps the class being looked at — see
  // scopedHref. Without it, opening a script from a colleague's class would
  // bounce back to your own the moment you approved it.
  const fromCourse = (Array.isArray(from) ? from[0] : from) === "course";
  //
  // One builder for every link back into this page. Sticking the tab, the class
  // and the way in together by hand produced "?class=x?from=course" the moment
  // a teacher opened a colleague's class from a course — scopedHref appends the
  // class last and needs a well-formed query to append to, so the query is
  // built first and handed over whole.
  const link = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(extra);
    if (fromCourse) q.set("from", "course");
    const base = `/teacher/homework/${hw.number}`;
    return scopedHref(scope, q.size ? `${base}?${q}` : base);
  };
  const tabHrefs = {
    summary: link(),
    question: link({ tab: "question" }),
    individual: link({ tab: "individual" }),
  };
  const individualHref = (studentId: string) =>
    link({ tab: "individual", student: studentId });

  // Every live row for the roster, drafts included. Drafts are still the
  // student's own business — a teacher can neither read nor mark one — but a
  // redo draft is a state this page has to be able to report: the student
  // handed in, was marked, and was sent back. Filtering them out in SQL left
  // those students indistinguishable from the ones who never started.
  const studentIds = roster.map((s) => s.id);
  const { data: liveData } = studentIds.length
    ? await db
        .from("submissions")
        .select("id, student_id, status, is_late, imported_marks, attempt, previous_pct")
        .eq("homework_id", hw.id)
        .in("student_id", studentIds)
    : { data: [] as { id: string; student_id: string; status: string; is_late: boolean; imported_marks: number | null; attempt: number; previous_pct: number | null }[] };
  const live = liveData ?? [];
  // Everything below this line means "a submission the teacher can see", which
  // is what `subs` has always meant — so drafts leave again here and every
  // existing count, tab, score and picker entry is unchanged.
  const subs = live.filter((s) => s.status !== "draft");
  const draftByStudent = new Map(
    live.filter((s) => s.status === "draft").map((s) => [s.student_id, s]),
  );
  const liveByStudent = new Map(live.map((s) => [s.student_id, s]));

  const hasResponses = subs.length > 0;
  const requested: ResultsTab =
    tab === "question" || tab === "individual" ? tab : "summary";
  const view: ResultsTab = hasResponses ? requested : "question";

  // Every answer on the class's submissions. Read on every tab, not just the
  // two that display them: a mark is the sum of its answers, so without these
  // the header counts and the percentages beside each name in the individual
  // picker would report an unmarked class — while a homework carried over from
  // the spreadsheet, whose total needs no answers, showed its marks fine. The
  // one script the individual panel opens is read separately, below.
  const { data: answersData } = hasResponses
    ? await db
        .from("answers")
        .select("submission_id, question_id, response, auto_marks, final_marks")
        .in("submission_id", subs.map((s) => s.id))
    : { data: [] as { submission_id: string; question_id: string; response: unknown; auto_marks: number | null; final_marks: number | null }[] };
  const answers = answersData ?? [];

  const subByStudent = new Map(subs.map((s) => [s.student_id, s]));
  const studentBySub = new Map(subs.map((s) => [s.id, s.student_id]));
  const nameById = new Map(roster.map((s) => [s.id, s.full_name]));
  const scoreBySub = new Map(
    scoreSubmissions(subs, answers, questions, totalMarks).map((s) => [s.submissionId, s]),
  );

  const rows: SummaryRow[] = roster.map((s) => {
    const sub = subByStudent.get(s.id);
    const score = sub ? scoreBySub.get(sub.id) : undefined;

    // Sent back: there is no submission to read, but "not submitted" would be
    // a lie about a student who handed in and was marked. The percentage shown
    // is the one that failed — `previous_pct`, carried on the reopened draft —
    // and it counts towards nothing, exactly as it no longer counts in v_hw_pct.
    const draft = sub ? undefined : draftByStudent.get(s.id);
    if (draft && draft.attempt > 1) {
      return {
        studentId: s.id,
        name: s.full_name,
        href: individualHref(s.id),
        state: "redo",
        marks: null,
        pct: draft.previous_pct === null ? null : Number(draft.previous_pct),
        late: false,
      };
    }

    return {
      studentId: s.id,
      name: s.full_name,
      href: individualHref(s.id),
      state: !sub
        ? "missing"
        : !score
          ? "waiting"
          : sub.status === "approved"
            ? "approved"
            : "provisional",
      marks: score?.marks ?? null,
      pct: score?.pct ?? null,
      late: Boolean(sub?.is_late),
    };
  });

  // Questions worth marking a class against: answered, marked, and carrying
  // marks of their own. A task is not a question and a zero-mark question
  // cannot cost anybody anything.
  const scoredQuestions = questionStats(questions, answers)
    .map((stat, i) => ({ stat, q: questions[i], n: i + 1 }))
    .filter(({ stat, q }) => stat.marked > 0 && Number(q.points) > 0 && !q.is_task);

  // The one the most students actually got wrong — a headcount, not a mean.
  // The two disagree often enough to be worth asking separately: a 4-mark
  // question everybody half-answered has the worse mean, while the 1-mark
  // question five of six missed outright is the one to reteach. Ties go to
  // the question that kept the fewest of its marks — the harder of the two.
  const mostMissed =
    scoredQuestions
      .filter(({ stat }) => stat.dropped > 0)
      .sort(
        (a, b) => b.stat.dropped - a.stat.dropped || a.stat.pctOfMax - b.stat.pctOfMax,
      )
      .map(({ stat, q, n: position }) => ({
        n: position,
        prompt: q.prompt,
        dropped: stat.dropped,
        marked: stat.marked,
        blank: stat.blank,
        pctOfMax: stat.pctOfMax,
        points: Number(q.points),
      }))[0] ?? null;

  // The questions that cost the class the most, ranked by the marks they kept.
  // Full marks all round is not a finding, so a question everyone got right
  // drops out rather than heading a list called "where the marks went" — and
  // so does the one already named above it.
  const hardest = scoredQuestions
    .filter(({ stat, n }) => stat.pctOfMax < 100 && n !== mostMissed?.n)
    .sort((a, b) => a.stat.pctOfMax - b.stat.pctOfMax)
    .slice(0, 4)
    .map(({ stat, q, n: position }) => ({
      n: position,
      prompt: q.prompt,
      pctOfMax: stat.pctOfMax,
      points: Number(q.points),
    }));

  /* ── the individual panel ── */

  // A `student` that is not on this teacher's roster simply selects nobody —
  // the same guard the marking screen makes, made by never finding the row.
  const selected =
    view === "individual" && student ? roster.find((s) => s.id === student) ?? null : null;
  const selectedSub = selected ? subByStudent.get(selected.id) ?? null : null;
  // The student's live row whatever its state — a redo draft has no script to
  // mark, but it does have a history, and that history is what a teacher who
  // picks a "redo pending" name has come to see. Read for any attempt past the
  // first, handed in or not, so the redo can be read against what it replaced.
  const selectedLive = selected ? liveByStudent.get(selected.id) ?? null : null;
  const redoLive = selectedLive && selectedLive.attempt > 1 ? selectedLive : null;

  let review: {
    answers: {
      id: string;
      question_id: string;
      response: unknown;
      auto_marks: number | null;
      auto_rubric: { id: string; present: boolean; why?: string }[] | null;
      final_marks: number | null;
      teacher_comment: string | null;
    }[];
    voiceNotes: { question_id: string; storage_path: string; duration_s: number | null }[];
    approved: boolean;
  } | null = null;

  if (selectedSub) {
    // Opening an unmarked script marks it — objective in code, written answers
    // via the model — so a teacher always lands on something marked, exactly as
    // the marking queue behaves. It only ever runs for a script they asked for.
    if (selectedSub.status === "submitted") {
      await markSubmission(selectedSub.id, { homeworkId: hw.id });
    }
    const [{ data: ans }, { data: notes }] = await Promise.all([
      db
        .from("answers")
        .select("id, question_id, response, auto_marks, auto_rubric, final_marks, teacher_comment")
        .eq("submission_id", selectedSub.id),
      db
        .from("voice_notes")
        .select("question_id, storage_path, duration_s")
        .eq("submission_id", selectedSub.id),
    ]);
    review = {
      answers: (ans ?? []).map((a) => ({
        id: a.id,
        question_id: a.question_id,
        response: a.response,
        auto_marks: a.auto_marks === null ? null : Number(a.auto_marks),
        auto_rubric: parseAutoRubric(a.auto_rubric),
        final_marks: a.final_marks === null ? null : Number(a.final_marks),
        teacher_comment: a.teacher_comment,
      })),
      voiceNotes: notes ?? [],
      approved: selectedSub.status === "approved",
    };
  }

  // The attempts this student already had at the paper, newest first. The
  // approver needs its own FK hint: `submission_attempts` names a profile twice
  // (the student and whoever released the attempt) and the bare embed fails at
  // runtime with PGRST201 while typechecking clean — LEARNINGS.md 2026-08-12.
  const { data: attemptRows } = redoLive
    ? await db
        .from("submission_attempts")
        .select(`
          attempt, pct, approved_at, is_late, answers, voice_notes,
          profiles!submission_attempts_approved_by_fkey(full_name)
        `)
        .eq("submission_id", redoLive.id)
        .order("attempt", { ascending: false })
    : { data: null };
  const pastAttempts = (attemptRows ?? []).map((a) => ({
    attempt: a.attempt,
    pct: a.pct === null ? null : Number(a.pct),
    approved_at: a.approved_at,
    approver: a.profiles?.full_name ?? null,
    is_late: a.is_late,
    answers: a.answers,
    voice_notes: a.voice_notes,
  }));

  const reviewQuestions = questions.map((q) => ({
    id: q.id,
    position: q.position,
    prompt: q.prompt,
    points: Number(q.points),
    qtype: q.qtype,
    is_bonus: q.is_bonus,
    is_task: q.is_task,
    options:
      parseOptions(q.options)?.map((o) => ({
        position: o.position,
        // the locator a tap-the-rule question hangs its passage off
        label: o.label,
        value: o.value,
        correct: o.correct,
      })) ?? null,
    rubric: parseRubric(q.rubric),
  }));

  // The picker lists everyone, with how they did, so choosing is informed and
  // a teacher hunting for who is missing can still land on them. `rows` is
  // already in register order and already carries the state.
  const pickerStudents = rows.map((r) => ({
    id: r.studentId,
    label:
      r.state === "redo"
        ? `${r.name} · redo pending`
        : r.state === "missing"
          ? `${r.name} · not handed in`
          : r.pct === null
            ? `${r.name} · not marked`
            : `${r.name} · ${Math.round(r.pct)}%`,
  }));

  // Who actually handed in — the figure the empty state quotes when nobody is
  // picked yet. It counted the pager's steps too, until the picker replaced it.
  const handedIn = roster.filter((s) => subByStudent.has(s.id));

  const marked = rows.filter((r) => r.state === "approved").length;
  const waiting = rows.filter(
    (r) => r.state === "waiting" || r.state === "provisional",
  ).length;
  const redoPending = rows.filter((r) => r.state === "redo").length;

  return (
    <>
      <header className="masthead">
        {/* The trail follows the way in. Arriving from a course, the block it
            belongs to is the step back; arriving from the marking section — the
            usual way — it is the homework list. The masthead names the course
            either way, so no context is lost by the shorter trail. */}
        <Crumbs
          items={
            fromCourse && week
              ? [
                  { label: "Curriculum", href: "/teacher/curriculum" },
                  {
                    label: blockTopic(hw.series, week.term_id).label,
                    href: `/teacher/curriculum/c/${hw.series}/${week.term_id}`,
                  },
                  { label: homeworkLabel(hw.number, hw.series) },
                ]
              : [
                  { label: "Homework", href: scopedHref(scope, "/teacher/homework") },
                  { label: homeworkLabel(hw.number, hw.series) },
                ]
          }
        />
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <h1><b>{homeworkLabel(hw.number, hw.series)}</b></h1>
          <span className="text-sm text-muted-foreground">
            {seriesShort(hw.series)}
            {week && <> · Term {week.term_id}, week {week.number}</>}
            {" · out of "}{totalMarks}
            {!hw.is_graded && " · ungraded"}
          </span>
        </div>
        {title && (
          <MixedText text={title} className="mt-3.5 block text-sm text-muted-foreground" />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Redo pending is its own figure, not folded into "not submitted":
              a student who was marked and sent back has done more than one
              who never started, and without it the four numbers stop adding
              up to the roster. Shown only when there is one, so the line
              stays as short as it was for the usual week. */}
          <p className="text-xs tabular-nums text-muted-foreground">
            {scope.label} · {marked} marked · {waiting} waiting ·{" "}
            {rows.filter((r) => r.state === "missing").length} not submitted
            {redoPending > 0 && <> · {redoPending} redo pending</>}
          </p>
          <ClassFilter
            classes={scope.classes}
            selected={scope.selected?.id ?? null}
            own={scope.own}
          />
        </div>
      </header>

      {hasResponses ? (
        <>
          <ResultsTabs
            hrefs={tabHrefs}
            active={view}
            questionCount={questions.length}
            responseCount={subs.length}
          />

          <div className="mt-6 space-y-4">
            {view === "summary" && (
              <ResultsSummary
                rows={rows}
                totalMarks={totalMarks}
                hardest={hardest}
                mostMissed={mostMissed}
                questionHref={tabHrefs.question}
              />
            )}

            {view === "question" && answers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No answers were recorded against these submissions. Last year&apos;s
                results came over from the spreadsheet as totals only, so there is
                nothing to show under each question. This is the paper itself.
              </p>
            )}

            {view === "question" && (
              <QuestionBreakdown
                questions={questions}
                answers={answers}
                attribution={(submissionId) => {
                  const studentId = studentBySub.get(submissionId);
                  const name = studentId ? nameById.get(studentId) : undefined;
                  return studentId && name
                    ? { name, href: individualHref(studentId) }
                    : null;
                }}
              />
            )}

            {view === "individual" && (
              <div className="space-y-4">

                <div className="mx-auto w-full min-w-0 max-w-[46rem] space-y-4">
                  {/* Outside the branches below on purpose: this is the only
                      way to change student, so it has to survive the states
                      where there is no script to read — otherwise "pick a
                      student" is an instruction with nothing to pick with.
                      Sticky because a script runs well past a screen, and
                      `bg-page` so the marks do not show through it. */}
                  <div className="sticky top-[var(--chrome-top,0px)] z-20 -mx-1 flex flex-wrap items-baseline justify-between gap-3 bg-page px-1 py-2">
                    {/* The name IS the picker. It was a heading with a separate
                        control above it saying the same word; one of them was
                        redundant and it was not the name. */}
                    <h2 className="min-w-0">
                      <StudentPicker
                        students={pickerStudents}
                        selected={selected?.id ?? null}
                        size="lg"
                      />
                    </h2>
                    {/* The late flag stays: it is a fact about the script,
                        not a way to get to another one. The "N of M" counter
                        and the prev/next links went with the pager — the
                        picker beside them names every student and how they
                        did, which is the same walk with the destination
                        visible. */}
                    {selected && selectedSub?.is_late && (
                      <span className="rounded bg-warn/12 px-1.5 py-0.5 text-xs text-warn">late</span>
                    )}
                  </div>

                  {!selected && (
                    <p className="empty">
                      Pick a student to read their script. {handedIn.length} of{" "}
                      {roster.length} have handed this in.
                    </p>
                  )}

                  {/* A redo still being written has no script of its own, but
                      "hasn't handed this in" would be untrue of a student who
                      did, and was sent back. Say what happened, then show the
                      paper that failed — that is what the teacher picked the
                      name to read. */}
                  {selected && !selectedSub && redoLive && (
                    <>
                      <p className="empty">
                        {selected.full_name} was sent back
                        {redoLive.previous_pct !== null && (
                          <> after scoring {Math.round(Number(redoLive.previous_pct))}%</>
                        )}{" "}
                        and hasn&apos;t handed the redo in yet.
                      </p>
                      <PastAttempts attempts={pastAttempts} questions={reviewQuestions} />
                    </>
                  )}

                  {selected && !selectedSub && !redoLive && (
                    <p className="empty">
                      {selected.full_name} hasn&apos;t handed this in.
                    </p>
                  )}

                  {selected && selectedSub && review && (
                    <>

                      {/* Most of last year's results came over as a single
                          total per homework — Google Forms exported nothing
                          else — so there is no script to read and a marking
                          panel would show an empty paper and a running total of
                          zero. Say what the mark is and where it came from. */}
                      {review.answers.length === 0 ? (
                        <p className="empty">
                          {selectedSub.imported_marks === null ? (
                            <>No answers were recorded on this submission, so there is nothing to mark.</>
                          ) : (
                            <>
                              Carried over from the 2025/26 spreadsheet:{" "}
                              <span className="tabular-nums text-foreground">
                                {Number(selectedSub.imported_marks)} out of {totalMarks}
                              </span>
                              . Only the total came across. There are no answers to read.
                            </>
                          )}
                        </p>
                      ) : (
                        /* Approving stays on this page rather than bouncing
                           back to the marking queue — the next script is one
                           click away in the list above it. The measure lives on
                           the column now, so the panel needs no width of its own. */
                        <ReviewPanel
                          key={selectedSub.id}
                          submissionId={selectedSub.id}
                          questions={reviewQuestions}
                          answers={review.answers}
                          voiceNotes={review.voiceNotes}
                          approved={review.approved}
                          backHref={individualHref(selected.id)}
                        />
                      )}
                      {/* Under the live script, as on the marking screen: the
                          redo is read against what it replaced. */}
                      {redoLive && (
                        <PastAttempts attempts={pastAttempts} questions={reviewQuestions} />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            Nobody has handed this in yet, so there is nothing to summarise. This is
            the paper itself: the answer key, the mark scheme, and how each question
            scores.
          </p>
          <QuestionBreakdown questions={questions} answers={[]} attribution={() => null} />
        </div>
      )}
    </>
  );
}
