import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
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

  const { data: sub } = await db
    .from("submissions")
    .select("id, status, is_late, submitted_at, homework_id, student_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) notFound();

  // opening an unmarked submission marks it — objective instantly, written
  // answers via the model — so the teacher always lands on a marked page
  if (sub.status === "submitted") {
    await markSubmission(sub.id);
  }

  const [{ data: hw }, { data: student }, { data: questions }, { data: answers }, { data: voiceNotes }] =
    await Promise.all([
      db.from("homeworks").select("number, title, series, total_marks").eq("id", sub.homework_id).single(),
      db.from("profiles").select("full_name, class_id").eq("id", sub.student_id).single(),
      db.from("questions")
        .select("id, position, prompt, points, qtype, is_bonus, is_task, options")
        .eq("homework_id", sub.homework_id).order("position"),
      db.from("answers")
        .select("id, question_id, response, auto_marks, auto_rubric, final_marks")
        .eq("submission_id", sub.id),
      db.from("voice_notes")
        .select("question_id, storage_path, duration_s")
        .eq("submission_id", sub.id),
    ]);

  const { data: cls } = student?.class_id
    ? await db.from("classes").select("name").eq("id", student.class_id).maybeSingle()
    : { data: null };

  const backHref = `/teacher/homework/${hw?.number ?? ""}`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href={backHref} className="text-xs text-muted-foreground underline underline-offset-4">
          ← {hw ? homeworkLabel(hw.number, hw.series) : "Homework"}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl">{student?.full_name}</h1>
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
    </div>
  );
}
