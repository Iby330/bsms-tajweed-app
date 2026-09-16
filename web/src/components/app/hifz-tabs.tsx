import Link from "next/link";
import { cn } from "@/lib/utils";

/** Overview | Review | Hear pill nav. basePath is the bare page URL. Hear
 *  only appears when the caller passes `hearHref` — the teacher's own
 *  student page links it to the desk pre-selected on this student. */
export function HifzTabs({
  basePath, active, hearHref,
}: {
  basePath: string;
  active: "overview" | "review" | "hear";
  hearHref?: string;
}) {
  const cls = (id: string) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm transition-colors",
      active === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="glass inline-flex rounded-xl p-1">
      <Link href={basePath} className={cls("overview")}>Overview</Link>
      <Link href={`${basePath}?tab=review`} className={cls("review")}>Review</Link>
      {hearHref && <Link href={hearHref} className={cls("hear")}>Hear</Link>}
    </nav>
  );
}
