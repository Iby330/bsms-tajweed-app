import Link from "next/link";
import { cn } from "@/lib/utils";

/** Overview | Review pill nav. basePath is the bare page URL. */
export function HifzTabs({ basePath, active }: { basePath: string; active: "overview" | "review" }) {
  const cls = (id: string) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm transition-colors",
      active === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="glass inline-flex rounded-xl p-1">
      <Link href={basePath} className={cls("overview")}>Overview</Link>
      <Link href={`${basePath}?tab=review`} className={cls("review")}>Review</Link>
    </nav>
  );
}
