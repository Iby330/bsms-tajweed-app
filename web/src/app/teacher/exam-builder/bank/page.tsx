import type { Metadata } from "next";
import { Crumbs } from "@/components/app/crumbs";
import { BankBrowser } from "@/components/exam-builder/bank-browser";
import "@/components/exam-builder/exam-builder.css";
import { loadBank } from "@/lib/exam-builder/queries";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

/** The bank on its own, to browse and to add to. Questions go onto a paper from the builder. */
export default async function ExamBank() {
  const [{ topics, questions }, me] = await Promise.all([loadBank(), currentProfile()]);
  const unused = questions.filter((q) => q.used_in.length === 0).length;
  return (
    <>
      <header className="masthead">
        <Crumbs items={[{ label: "Exam Builder", href: "/teacher/exam-builder" }, { label: "Question bank" }]} />
        <h1>Question bank <span>/ every past question, by topic.</span></h1>
        <p>
          Open a series to see its rules, and a rule to see its questions. Write a new question to add it to the bank.
          To put a question on a paper, open the paper and use the bank beside it.
        </p>
        <div className="meta">
          <span className="label">{questions.length} questions · {unused} not used before</span>
        </div>
      </header>
      <BankBrowser topics={topics} questions={questions} profileId={me?.id ?? ""} canEdit={!!me?.is_admin} />
    </>
  );
}
