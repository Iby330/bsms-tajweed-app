import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { homeworkScope, scopedHref } from "@/lib/teacher/scope";
import { ClassFilter } from "@/components/app/class-filter";
import { markSubmission } from "@/lib/marking/actions";
import { parseAutoRubric, parseOptions } from "@/lib/marking/objective";
import { questionStats, scoreSubmissions } from "@/lib/marking/responses";
import { blockTopic } from "@/lib/curriculum/catalogue";
import { moduleTitle } from "@/lib/curriculum/tree";
import { seriesShort } from "@/lib/lessons/series";
import { homeworkLabel } from "@/components/app/homework-row";
import { Crumbs } from "@/components/app/crumbs";
import { MixedText } from "@/components/app/mixed-text";
import { ReviewPanel } from "@/components/app/review-panel";
import { ResultsTabs, type ResultsTab } from "@/components/app/results-tabs";
import { ResultsSummary, type SummaryRow } from "@/components/app/results-summary";
import { QuestionBreakdown } from "@/components/app/question-breakdown";
import { cn } from "@/lib/utils";

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

  // Drafts are the student's own business — a teacher can neither see nor mark
  // one, so they are not "handed in" for any count on this page.
  const studentIds = roster.map((s) => s.id);
  const { data: subsData } = studentIds.length
    ? await db
        .from("submissions")
        .select("id, student_id, status, is_late, imported_marks")
        .eq("homework_id", hw.id)
        .in("student_id", studentIds)
        .in("status", ["submitted", "auto_marked", "approved"])
    : { data: [] as { id: string; student_id: string; status: string; is_late: boolean; imported_marks: number | null }[] };
  const subs = subsData ?? [];

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

  // The questions that cost the class the most. Full marks all round is not a
  // finding, so a question everyone got right drops out rather than heading a
  // list called "where the marks went".
  const hardest = questionStats(questions, answers)
    .map((stat, i) => ({ stat, q: questions[i], n: i + 1 }))
    .filter(
      ({ stat, q }) =>
        stat.marked > 0 && Number(q.points) > 0 && !q.is_task && stat.pctOfMax < 100,
    )
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
  }));

  // Paging runs over the students who handed in, in register order — the ones
  // with nothing to read are not steps on the way to the next script.
  const handedIn = roster.filter((s) => subByStudent.has(s.id));
  const at = selected ? handedIn.findIndex((s) => s.id === selected.id) : -1;
  const prev = at > 0 ? handedIn[at - 1] : null;
  const next = at >= 0 && at < handedIn.length - 1 ? handedIn[at + 1] : null;

  const marked = rows.filter((r) => r.state === "approved").length;
  const waiting = rows.filter(
    (r) => r.state === "waiting" || r.state === "provisional",
  ).length;

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
          <p className="text-xs tabular-nums text-muted-foreground">
            {scope.label} · {marked} marked · {waiting} waiting ·{" "}
            {rows.filter((r) => r.state === "missing").length} not submitted
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
                questionHref={tabHrefs.question}
              />
            )}

            {view === "question" && answers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No answers were recorded against these submissions — last year&apos;s
                results came over from the spreadsheet as totals only — so there is
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
              <div className="grid gap-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                <nav aria-label="Students" className="lg:sticky lg:top-4 lg:self-start">
                  <ul className="field" style={{ gridTemplateColumns: "1fr" }}>
                    {rows.map((r) => (
                      <li key={r.studentId} className="box" style={{ padding: 0 }}>
                        {r.state === "missing" ? (
                          <span className="flex items-baseline justify-between gap-2 px-3 py-2 text-sm opacity-60">
                            <span className="min-w-0 truncate">{r.name}</span>
                            <span className="shrink-0 text-[11px]">—</span>
                          </span>
                        ) : (
                          <Link
                            href={r.href}
                            aria-current={selected?.id === r.studentId ? "page" : undefined}
                            className={cn(
                              "flex items-baseline justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/60",
                              selected?.id === r.studentId && "bg-muted font-medium",
                            )}
                          >
                            <span className="min-w-0 truncate">{r.name}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {r.pct === null ? "•" : `${Math.round(r.pct)}%`}
                            </span>
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="min-w-0 space-y-4">
                  {!selected && (
                    <p className="empty">
                      Pick a student to read their script. {handedIn.length} of{" "}
                      {roster.length} have handed this in.
                    </p>
                  )}

                  {selected && !selectedSub && (
                    <p className="empty">
                      {selected.full_name} hasn&apos;t handed this in.
                    </p>
                  )}

                  {selected && selectedSub && review && (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <h2 className="text-lg font-medium">{selected.full_name}</h2>
                        <span className="flex items-center gap-3 text-xs">
                          {selectedSub.is_late && (
                            <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>
                          )}
                          <span className="tabular-nums text-muted-foreground">
                            {at + 1} of {handedIn.length}
                          </span>
                          {prev ? (
                            <Link href={individualHref(prev.id)} className="hover:underline underline-offset-4">
                              ← {prev.full_name.split(" ")[0]}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/50">←</span>
                          )}
                          {next ? (
                            <Link href={individualHref(next.id)} className="hover:underline underline-offset-4">
                              {next.full_name.split(" ")[0]} →
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/50">→</span>
                          )}
                        </span>
                      </div>

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
                              . Only the total came across — there are no answers to read.
                            </>
                          )}
                        </p>
                      ) : (
                        /* Approving stays on this page rather than bouncing
                           back to the marking queue — the next script is one
                           click away in the list beside it. */
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
            the paper itself — the answer key, the mark scheme, and how each question
            scores.
          </p>
          <QuestionBreakdown questions={questions} answers={[]} attribution={() => null} />
        </div>
      )}
    </>
  );
}
