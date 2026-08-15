import { notFound } from "next/navigation";
import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { createDraftSubmission } from "@/lib/homework/actions";
import { parseStudentHomework } from "@/lib/homework/logic";
import { HomeworkForm } from "@/components/app/homework-form";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";
import { Crumbs } from "@/components/app/crumbs";
import { homeworkLabel } from "@/components/app/homework-row";
import { seriesShort } from "@/lib/lessons/series";
import { moduleTitle } from "@/lib/curriculum/tree";
import { parseOrigin, homeworkNav } from "@/lib/homework/back-link";

export const dynamic = "force-dynamic";

export default async function HomeworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ n }, { from }] = await Promise.all([params, searchParams]);
  const number = Number(n);
  if (!Number.isFinite(number)) notFound();
  const origin = parseOrigin(from);

  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  // The week and its lessons come back on the homework's own foreign keys, so
  // the crumbs and the "watch the video" link cost no extra round trip.
  const { data: row } = await db
    .from("homeworks")
    .select("id, number, title, is_graded, week_id, series, weeks(term_id, lessons(id, series, position))")
    .eq("number", number)
    .maybeSingle();
  if (!row) notFound();

  const week = row.weeks;
  // The lesson is picked by this homework's SERIES, not just its week. A week
  // can carry two courses at once — Term 3 week 1 has Tajweed 16 and TFP 1 —
  // so a week-only match would send the student back to the other course's
  // video. First by position, as before.
  const lesson = (week?.lessons ?? [])
    .filter((l) => l.series === row.series)
    .sort((a, b) => a.position - b.position)[0];

  // answer keys are stripped server-side — students never receive them.
  // Neither read depends on the other, so they share one wave.
  const [{ data: payload }, { data: sub }] = await Promise.all([
    db.rpc("get_homework_for_student", { hw_id: row.id }),
    db
      .from("submissions").select("id, status")
      .eq("homework_id", row.id).eq("student_id", profile.id).maybeSingle(),
  ]);
  const parsed = parseStudentHomework(payload);
  if (!parsed) notFound();

  const readOnly = !!sub && sub.status !== "draft";
  // A submission of any status already answers the question — only a student
  // opening the homework for the first time pays for a write.
  const submissionId = sub ? sub.id : await createDraftSubmission(row.id);

  const [{ data: answers }, { data: voiceNotes }] = await Promise.all([
    db
      .from("answers")
      .select("question_id, response, final_marks, auto_rubric, teacher_comment")
      .eq("submission_id", submissionId),
    db
      .from("voice_notes")
      .select("question_id, storage_path, duration_s")
      .eq("submission_id", submissionId),
  ]);

  // TFP homework is numbered 101+ in the database — the label turns that back
  // into "TFP 5" so a student is never shown "Homework 105".
  const label = homeworkLabel(parsed.homework.number, row.series);

  // "Back" is named after wherever they actually came from; the video stays
  // reachable regardless, since it's a fact about this homework rather than
  // about their route.
  const nav = homeworkNav(origin, {
    lessonId: lesson?.id,
    termId: week?.term_id,
    series: row.series,
    courseLabel: seriesShort(row.series),
  });

  return (
    <>
      <header className="masthead">
        {(week || nav.back || nav.video) && (
          <div className="flex flex-col items-start gap-1">
            {week && (
              <Crumbs
                items={[
                  { label: "Courses", href: "/courses" },
                  { label: `Term ${week.term_id}`, href: `/courses/${week.term_id}` },
                  {
                    label: seriesShort(row.series),
                    href: `/courses/${week.term_id}/${row.series}`,
                  },
                  { label },
                ]}
              />
            )}
            {(nav.back || nav.video) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ marginTop: 6 }}>
                {nav.back && (
                  <Link href={nav.back.href} className="label backlink">
                    ← {nav.back.label}
                  </Link>
                )}
                {nav.video && (
                  <Link href={nav.video.href} className="label backlink">
                    <span aria-hidden>▸</span> {nav.video.label}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
        {/* The subject is the heading; "Homework 2" belongs on the label line
            with everything else that locates it. */}
        <h1 style={{ marginTop: 16 }}>
          <MixedText text={moduleTitle(parsed.homework.title) || label} />
        </h1>
        <div className="meta">
          <span className="label">
            {label}
            {week && ` · Term ${week.term_id}`} ·{" "}
            {parsed.questions.length}{" "}
            {parsed.questions.length === 1 ? "question" : "questions"}
            {readOnly && " · handed in"}
          </span>
          {parsed.homework.due_at && !readOnly && (
            <CountdownChip dueAt={parsed.homework.due_at} />
          )}
        </div>
      </header>

      <HomeworkForm
        submissionId={submissionId}
        questions={parsed.questions}
        existing={(answers ?? []) as never}
        voiceNotes={voiceNotes ?? []}
        status={sub?.status ?? "draft"}
        readOnly={readOnly}
      />
    </>
  );
}
