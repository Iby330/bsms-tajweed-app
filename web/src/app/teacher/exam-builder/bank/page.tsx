import type { Metadata } from "next";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

/** The bank on its own: browse, and add a question. Placeholder until plan Task 4. */
export default function QuestionBank() {
  return (
    <header className="masthead">
      <h1><span>Question bank</span></h1>
      <p>Coming together…</p>
    </header>
  );
}
