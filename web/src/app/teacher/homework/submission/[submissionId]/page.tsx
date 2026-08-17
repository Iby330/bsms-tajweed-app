import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { teacherClass } from "@/lib/teacher/scope";
import { markSubmission } from "@/lib/marking/actions";
import { ReviewPanel } from "@/components/app/review-panel";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { moduleTitle } from "@/lib/curriculum/tree";

export const dynamic = "force-dynamic";

export default async function SubmissionReview({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const db = await supabaseServer();
  // Read alongside the submission: it decides whether to render, not what to
  // fetch. See the guard below for why it is here at all.
  const mine = await teacherClass();

  // Student, class, homework, questions, answers and voice notes all hang off
  // this submission by a foreign key, so PostgREST returns the lot in one round
  // trip. `classes` needs its hint because a class points back at a teacher
  // profile as well; `profiles` needs one because a submission names both a
  // student and its approver.
  const { data: sub } = await db
    .from("submissions")
    .select(`
      id, status, is_late, submitted_at, homework_id, student_id,
      profiles!submissions_student_id_fkey(
        full_name, class_id, classes!profiles_class_id_fkey(name)
      ),
      homeworks(
        number, title, series, total_marks,
        questions(id, position, prompt, points, qtype, is_bonus, is_task, options)
      ),
      answers(id, question_id, response, auto_marks, auto_rubric, final_marks, teacher_comment),
      voice_notes(question_id, storage_path, duration_s)
    `)
    .eq("id", submissionId)
    .order("position", { referencedTable: "homeworks.questions" })
    .maybeSingle();
  if (!sub) notFound();

  // A teacher with a class of their own only marks their own class. The roster
  // page has always done this; this page and the hifdh page did not, so every
  // marked script in the programme — answers, marks and comments — was one
  // guessed URL away from any teacher. It matters more now that accounts exist
  // for teachers who are meant to see a demo class and nothing else.
  //
  // Same shape as the roster's guard, and the same caveat: this is usability
  // and blast-radius scoping, not a security boundary. RLS still grants every
  // teacher the whole cohort, so a determined teacher with their own token can
  // still read these rows through the API. Narrowing that means narrowing the
  // policies, which would change what the leaderboards can show everyone.
  if (mine && sub.profiles?.class_id !== mine.id) notFound();

  const hw = sub.homeworks;
  const student = sub.profiles;
  const cls = student?.classes;
  const questions = hw?.questions;
  const voiceNotes = sub.voice_notes;
  let answers: typeof sub.answers | null = sub.answers;

  // opening an unmarked submission marks it — objective instantly, written
  // answers via the model — so the teacher always lands on a marked page.
  // Marking touches nothing but the answers, so only they are read back.
  if (sub.status === "submitted") {
    await markSubmission(sub.id, { homeworkId: sub.homework_id });
    const { data: marked } = await db
      .from("answers")
      .select("id, question_id, response, auto_marks, auto_rubric, final_marks, teacher_comment")
      .eq("submission_id", sub.id);
    answers = marked;
  }

  const backHref = `/teacher/homework/${hw?.number ?? ""}`;

  return (
    <>
      <header className="masthead">
        <Link href={backHref} className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          {hw ? homeworkLabel(hw.number, hw.series) : "Homework"}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1><b>{student?.full_name}</b></h1>
          <span className="text-sm text-muted-foreground">
            {cls?.name}{hw && <> · {homeworkLabel(hw.number, hw.series)}</>}
            {sub.is_late && <span className="ml-2 rounded bg-warn/12 px-1.5 py-0.5 text-xs text-warn">late</span>}
          </span>
        </div>
        <MixedText text={hw ? moduleTitle(hw.title) : ""} className="block text-sm text-muted-foreground" />
      </header>

      <ReviewPanel
        submissionId={sub.id}
        questions={(questions ?? []) as never}
        answers={(answers ?? []) as never}
        voiceNotes={voiceNotes ?? []}
        approved={sub.status === "approved"}
        backHref={backHref}
      />
    </>
  );
}
