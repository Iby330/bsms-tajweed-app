import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/exam-builder/workspace";
import { loadBank, loadPaper } from "@/lib/exam-builder/queries";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exam paper" };
export const dynamic = "force-dynamic";

/** One paper in the builder: the bank beside the paper. */
export default async function ExamPaper({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const [loaded, bank, me] = await Promise.all([loadPaper(paperId), loadBank(), currentProfile()]);
  if (!loaded || !me) notFound();
  return (
    <Workspace key={loaded.paper.id} initial={loaded} topics={bank.topics} questions={bank.questions} profileId={me.id} />
  );
}
