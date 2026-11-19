import type { Metadata } from "next";

export const metadata: Metadata = { title: "Exam Builder" };
export const dynamic = "force-dynamic";

/** My papers and "New paper". Placeholder until the workspace lands (plan Task 4). */
export default function ExamBuilder() {
  return (
    <header className="masthead">
      <h1><span>Exam Builder</span></h1>
      <p>Coming together…</p>
    </header>
  );
}
