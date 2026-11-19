import type { Metadata } from "next";
import { Crumbs } from "@/components/app/crumbs";
import { BankPanel } from "@/components/exam-builder/bank-panel";
import "@/components/exam-builder/exam-builder.css";
import { loadBank } from "@/lib/exam-builder/queries";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

/** The bank on its own, to browse. Questions are added to a paper from the builder. */
export default async function ExamBank() {
  const { topics, questions } = await loadBank();
  const unused = questions.filter((q) => q.used_in.length === 0).length;
  return (
    <>
      <header className="masthead">
        <Crumbs items={[{ label: "Exam Builder", href: "/teacher/exam-builder" }, { label: "Question bank" }]} />
        <h1>Question bank <span>/ every past question, by topic.</span></h1>
        <p>
          Open a series to see its rules, and a rule to see its questions. To put a question on a paper, open the
          paper and use the bank beside it.
        </p>
        <div className="meta">
          <span className="label">{questions.length} questions · {unused} not used before</span>
        </div>
      </header>
      <BankPanel topics={topics} questions={questions} className="border border-line bg-card" />
    </>
  );
}
