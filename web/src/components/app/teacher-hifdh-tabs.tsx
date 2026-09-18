import Link from "next/link";
import { cn } from "@/lib/utils";

/** Overview | Hear pill nav for the hifdh register itself — distinct from
 *  HifzTabs, which is Overview | Review on a single student's page. Hear
 *  lives only here: a student's own page has no Hear tab. */
export function TeacherHifdhTabs({ active }: { active: "overview" | "hear" }) {
  const cls = (id: string) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm transition-colors",
      active === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="glass inline-flex rounded-xl p-1">
      <Link href="/teacher/hifdh" className={cls("overview")}>Overview</Link>
      <Link href="/teacher/hifdh/hear" className={cls("hear")}>Hear</Link>
    </nav>
  );
}
