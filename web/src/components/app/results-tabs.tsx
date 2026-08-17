import Link from "next/link";
import { cn } from "@/lib/utils";

export type ResultsTab = "summary" | "question" | "individual";

/**
 * Summary · Question · Individual — the three ways to read one homework, the
 * same three Google Forms taught every teacher here to expect.
 *
 * Plain links with the tab in the URL rather than client state: each panel is
 * a different database read (the summary needs every mark, an individual needs
 * one script and its voice notes), so the server decides what to fetch and a
 * teacher can send "look at Q4" as a link. Summary is the default and stays out
 * of the query string.
 */
export function ResultsTabs({
  hrefs,
  active,
  questionCount,
  responseCount,
}: {
  /** Built by the page, so whichever class is being looked at travels along. */
  hrefs: Record<ResultsTab, string>;
  active: ResultsTab;
  questionCount: number;
  responseCount: number;
}) {
  const cls = (id: ResultsTab) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm transition-colors",
      active === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  const count = (n: number) => <span className="ml-1.5 text-xs opacity-60">{n}</span>;

  return (
    <nav className="glass inline-flex rounded-xl p-1" aria-label="Results view">
      <Link href={hrefs.summary} className={cls("summary")} aria-current={active === "summary" ? "page" : undefined}>
        Summary
      </Link>
      <Link
        href={hrefs.question}
        className={cls("question")}
        aria-current={active === "question" ? "page" : undefined}
      >
        Question{count(questionCount)}
      </Link>
      <Link
        href={hrefs.individual}
        className={cls("individual")}
        aria-current={active === "individual" ? "page" : undefined}
      >
        Individual{count(responseCount)}
      </Link>
    </nav>
  );
}
