import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/exam-builder/workspace";
import { loadBank, loadPaper } from "@/lib/exam-builder/queries";
import { loadQuranSnippets } from "@/lib/exam-builder/quran";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exam paper" };
export const dynamic = "force-dynamic";

/** One paper in the builder: the paper with its outline, and the bank in the "Add a question" drawer. */
export default async function ExamPaper({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const [loaded, bank, me] = await Promise.all([loadPaper(paperId), loadBank(), currentProfile()]);
  if (!loaded || !me) notFound();
  // The typeset ayahs already on the paper come with the page; one added
  // later is fetched by the builder (use-quran-words).
  const quranWords = await loadQuranSnippets(
    loaded.items.filter((i) => i.prompt_quran && i.prompt_images.filter(Boolean).length === 0).map((i) => i.prompt_quran),
  ).catch(() => ({}));
  return (
    <Workspace
      key={loaded.paper.id}
      initial={loaded}
      topics={bank.topics}
      questions={bank.questions}
      profileId={me.id}
      quranWords={quranWords}
    />
  );
}
