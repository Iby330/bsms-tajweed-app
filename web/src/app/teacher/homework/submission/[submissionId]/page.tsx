import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/teacher/scope";
import { markSubmission } from "@/lib/marking/actions";
import { ReviewPanel } from "@/components/app/review-panel";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { moduleTitle } from "@/lib/curriculum/tree";

export const dynamic = "force-dynamic";

export default async function SubmissionReview({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ from?: string | string[]; class?: string }>;
}) {
  const [{ submissionId }, { from, class: classParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const db = await supabaseServer();
  // Read alongside the submission: it decides whether to render, not what to
  // fetch. See the guard below for why it is here at all.
  const allowed = await teacherClasses();

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

  // A teacher marks their own section: their class, and a colleague's when
  // covering. Beyond it — a sisters' script opened by a brothers' teacher, the
  // whole programme opened by a demo account — is not theirs to read, and
  // before this guard existed every marked script was one guessed URL away.
  //
  // Same caveat as the rest of the scoping: this is usability and blast-radius,
  // not a security boundary. RLS still grants every teacher the whole cohort,
  // so a determined teacher with their own token can still read these rows
  // through the API. Narrowing that means narrowing the policies, which would
  // change what the leaderboards can show everyone.
  if (allowed.length && !allowed.some((c) => c.id === sub.profiles?.class_id)) {
    notFound();
  }

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

  // Back belongs wherever the reader actually came from. Arriving from a bar
  // on a student's record, the homework's list of every student is a page they
  // never visited — so `?from=student` sends them back to the record instead.
  const fromStudent = (Array.isArray(from) ? from[0] : from) === "student";
  // Otherwise the class rides back with the teacher: approve a script from a
  // colleague's class and you land on that class's list, not your own. Anything
  // but a class this teacher may look at is dropped rather than echoed into a
  // link. A student's record is one student, so it needs no class.
  const carry =
    classParam === "all" || allowed.some((c) => c.id === classParam) ? classParam : undefined;
  const backHref = fromStudent
    ? `/teacher/roster/${sub.student_id}`
    : `/teacher/homework/${hw?.number ?? ""}` + (carry ? `?class=${carry}` : "");

  return (
    <>
      <header className="masthead">
        <Link href={backHref} className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          {/* Not the student's name — the heading directly below already is. */}
          {fromStudent ? "Back to record" : hw ? homeworkLabel(hw.number, hw.series) : "Homework"}
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
