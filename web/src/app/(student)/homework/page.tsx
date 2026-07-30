import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { statusChip } from "@/lib/homework/logic";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomeworkIndex() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const { data: homeworks } = await db
    .from("homeworks")
    .select("id, number, title, due_at, is_graded")
    .order("number");
  const { data: subs } = await db
    .from("submissions").select("homework_id, status").eq("student_id", profile.id);
  const byHw = new Map((subs ?? []).map((s) => [s.homework_id, s.status]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Homework</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Released weekly. Late work is accepted but flagged for your teacher.
        </p>
      </header>

      {!homeworks?.length ? (
        <p className="rounded-lg border border-line bg-card p-6 text-sm text-muted-foreground">
          Nothing released yet.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {homeworks.map((h) => {
            const chip = statusChip(byHw.get(h.id) as never);
            return (
              <li key={h.id}>
                <Link href={`/homework/${h.number}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/60">
                  <span className="min-w-0">
                    <span className="text-sm font-medium">Homework {h.number}</span>
                    <MixedText text={h.title} className="ml-2 text-xs text-muted-foreground" />
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {h.due_at && !byHw.get(h.id) && <CountdownChip dueAt={h.due_at} />}
                    <span className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      chip.tone === "ok" && "bg-ok/12 text-ok",
                      chip.tone === "warn" && "bg-warn/12 text-warn",
                      chip.tone === "ink" && "bg-muted text-foreground",
                      chip.tone === "muted" && "bg-muted text-muted-foreground",
                    )}>{chip.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
