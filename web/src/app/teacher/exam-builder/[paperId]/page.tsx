import type { Metadata } from "next";

export const metadata: Metadata = { title: "Exam paper" };
export const dynamic = "force-dynamic";

/** One paper in the builder. Placeholder until the workspace lands (plan Task 4). */
export default function ExamPaper() {
  return (
    <header className="masthead">
      <h1><span>Exam paper</span></h1>
      <p>Coming together…</p>
    </header>
  );
}
