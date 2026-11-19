import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/exam-builder/workspace";
import { loadBank, loadPaper } from "@/lib/exam-builder/queries";

export const metadata: Metadata = { title: "Exam paper" };
export const dynamic = "force-dynamic";

/** One paper in the builder: the bank beside the paper. */
export default async function ExamPaper({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const [loaded, bank] = await Promise.all([loadPaper(paperId), loadBank()]);
  if (!loaded) notFound();
  return <Workspace key={loaded.paper.id} initial={loaded} topics={bank.topics} questions={bank.questions} />;
}
