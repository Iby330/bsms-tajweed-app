import { notFound } from "next/navigation";
import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { ensureSubmission } from "@/lib/homework/actions";
import { parseStudentHomework } from "@/lib/homework/logic";
import { HomeworkForm } from "@/components/app/homework-form";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";

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
    .from("homeworks").select("id, number, title, is_graded").eq("number", number).maybeSingle();
  if (!row) notFound();

  // answer keys are stripped server-side — students never receive them
  const { data: payload } = await db.rpc("get_homework_for_student", { hw_id: row.id });
  const parsed = parseStudentHomework(payload);
  if (!parsed) notFound();

  const { data: sub } = await db
    .from("submissions").select("id, status")
    .eq("homework_id", row.id).eq("student_id", profile.id).maybeSingle();

  const readOnly = !!sub && sub.status !== "draft";
  const submissionId = readOnly ? sub!.id : await ensureSubmission(row.id);

  const { data: answers } = await db
    .from("answers")
    .select("question_id, response, final_marks, auto_rubric")
    .eq("submission_id", submissionId);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/homework" className="text-xs text-muted-foreground underline underline-offset-4">
          ← All homework
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl">Homework {parsed.homework.number}</h1>
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
        status={sub?.status ?? "draft"}
        readOnly={readOnly}
      />
    </div>
  );
}
