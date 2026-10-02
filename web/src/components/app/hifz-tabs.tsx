import Link from "next/link";
import { cn } from "@/lib/utils";

export type HifzTab = { id: string; label: string };

/** The student's own hifdh page: Overview | Review. */
const STUDENT_TABS: HifzTab[] = [
  { id: "overview", label: "Overview" },
  { id: "review", label: "Review" },
];

/**
 * Pill nav for a hifdh page. basePath is the bare page URL; the first tab
 * lives there and every other at `?tab=<id>`. The student's page keeps the
 * default Overview | Review; the teacher's register passes Overview | Hear.
 */
export function HifzTabs({
  basePath, active, tabs = STUDENT_TABS,
}: {
  basePath: string;
  active: string;
  tabs?: HifzTab[];
}) {
  const cls = (id: string) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm transition-colors",
      active === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="glass inline-flex rounded-xl p-1">
      {tabs.map((t, i) => (
        <Link key={t.id} href={i === 0 ? basePath : `${basePath}?tab=${t.id}`} className={cls(t.id)}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
