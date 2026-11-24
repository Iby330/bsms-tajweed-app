import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, Library } from "lucide-react";
import { NewPaperButton, PaperList } from "@/components/exam-builder/paper-list";
import { loadMyPapers } from "@/lib/exam-builder/queries";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exam Builder" };
export const dynamic = "force-dynamic";

/** My papers and the other teachers' drafts, "New paper", and the ways into the bank. */
export default async function ExamBuilder() {
  const [papers, profile] = await Promise.all([loadMyPapers(), currentProfile()]);
  const finals = papers.filter((p) => p.status === "final").length;
  const drafts = papers.filter((p) => p.shared && p.status !== "final").length;

  const link = "group inline-flex items-center gap-2 text-sm font-medium text-brand underline-offset-4 hover:underline";

  return (
    <>
      <header className="masthead">
        <h1>Exam Builder <span>/ build a paper from the bank.</span></h1>
        <p>
          Choose past questions by topic, change any of them on your paper without touching the bank, and print the
          paper and its mark scheme in last year&apos;s layout.
        </p>
        <div className="meta">
          <span className="label">
            {papers.length} {papers.length === 1 ? "paper" : "papers"}
            {drafts > 0 && ` · ${drafts} ${drafts === 1 ? "draft" : "drafts"}`}
            {finals > 0 && ` · ${finals} final`}
          </span>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        {papers.length > 0 ? <NewPaperButton /> : <span />}
        <nav aria-label="The question bank" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/teacher/exam-builder/bank" className={link}>
            <Library className="size-4" aria-hidden /> Browse the question bank
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          {profile?.is_admin && (
            <Link href="/teacher/exam-builder/review" className={link}>
              <ClipboardCheck className="size-4" aria-hidden /> Review imported questions
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          )}
        </nav>
      </div>

      <PaperList papers={papers} meId={profile?.id ?? ""} />
    </>
  );
}
