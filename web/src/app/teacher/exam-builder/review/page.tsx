import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewTable } from "@/components/exam-builder/review-table";
import { loadBankForReview } from "@/lib/exam-builder/queries";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review the bank" };
export const dynamic = "force-dynamic";

/**
 * Admin-only review of the imported questions. Anyone else gets a 404, not a
 * "not allowed": the page should not be discoverable. The actions check for
 * an admin again, and row level security a third time.
 */
export default async function ReviewBank() {
  if (!(await currentProfile())?.is_admin) notFound();
  const { topics, questions } = await loadBankForReview();

  return (
    <>
      <header className="masthead">
        <h1><span>Review the</span> <b>imported questions</b></h1>
        <p>
          “Needs a look” means the import had to guess something; the note on each card says what.
          Approve keeps the question exactly as it is. Edit fixes it, and saving approves it too.
          Bin hides it from teachers; you can bring it back from “Binned”.
          Papers teachers have already built hold their own copies, so nothing here changes them.
        </p>
      </header>
      <ReviewTable initial={questions} topics={topics} />
    </>
  );
}
