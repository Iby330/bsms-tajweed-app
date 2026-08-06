import { notFound } from "next/navigation";
import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { ensureSubmission } from "@/lib/homework/actions";
import { parseStudentHomework } from "@/lib/homework/logic";
import { HomeworkForm } from "@/components/app/homework-form";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";
import { Crumbs } from "@/components/app/crumbs";
import { homeworkLabel } from "@/components/app/homework-row";
import { seriesShort } from "@/lib/lessons/series";

export const dynamic = "force-dynamic";

export default async function HomeworkPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;
  const number = Number(n);
  if (!Number.isFinite(number)) notFound();

  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const { data: row } = await db
    .from("homeworks").select("id, number, title, is_graded, week_id, series").eq("number", number).maybeSingle();
  if (!row) notFound();

  // The lesson lookup is scoped to this homework's SERIES, not just its week.
  // A week can carry two courses at once — Term 3 week 1 has Tajweed 16 and
  // TFP 1 — so a week-only match would send the student back to the other
  // course's video.
  const [{ data: week }, { data: lesson }] = await Promise.all([
    db.from("weeks").select("id, term_id, number").eq("id", row.week_id).maybeSingle(),
    db
      .from("lessons")
      .select("id")
      .eq("week_id", row.week_id)
      .eq("series", row.series)
      .order("position")
      .limit(1)
      .maybeSingle(),
  ]);

  // answer keys are stripped server-side — students never receive them
  const { data: payload } = await db.rpc("get_homework_for_student", { hw_id: row.id });
  const parsed = parseStudentHomework(payload);
  if (!parsed) notFound();

  const { data: sub } = await db
    .from("submissions").select("id, status")
    .eq("homework_id", row.id).eq("student_id", profile.id).maybeSingle();

  const readOnly = !!sub && sub.status !== "draft";
  const submissionId = readOnly ? sub!.id : await ensureSubmission(row.id);

  const [{ data: answers }, { data: voiceNotes }] = await Promise.all([
    db
      .from("answers")
      .select("question_id, response, final_marks, auto_rubric")
      .eq("submission_id", submissionId),
    db
      .from("voice_notes")
      .select("question_id, storage_path, duration_s")
      .eq("submission_id", submissionId),
  ]);

  // TFP homework is numbered 101+ in the database — the label turns that back
  // into "TFP 5" so a student is never shown "Homework 105".
  const label = homeworkLabel(parsed.homework.number, row.series);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        {(week || lesson) && (
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
            {lesson && (
              <Link
                href={`/lessons/${lesson.id}`}
                className="text-xs text-muted-foreground underline underline-offset-4"
              >
                ← Back to the video
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl">{label}</h1>
          {parsed.homework.due_at && !readOnly && (
            <CountdownChip dueAt={parsed.homework.due_at} />
          )}
        </div>
        <MixedText text={parsed.homework.title} className="block text-sm text-muted-foreground" />
      </header>

      <HomeworkForm
        submissionId={submissionId}
        questions={parsed.questions}
        existing={(answers ?? []) as never}
        voiceNotes={voiceNotes ?? []}
        status={sub?.status ?? "draft"}
        readOnly={readOnly}
      />
    </div>
  );
}
