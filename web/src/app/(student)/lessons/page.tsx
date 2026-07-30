import Link from "next/link";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { MixedText } from "@/components/app/mixed-text";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SERIES: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "Ten Fundamental Principles",
  seerah: "Seerah",
};

export default async function Lessons() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { terms, weeks } = await getTermsAndWeeks();
  const now = Date.now();

  const { data: lessons } = await db
    .from("lessons").select("id, week_id, title, series, youtube_id").order("position");
  const { data: watches } = await db
    .from("lesson_watches").select("lesson_id").eq("student_id", profile.id);
  const watched = new Set((watches ?? []).map((w) => w.lesson_id));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Lessons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A new week unlocks every Monday.
        </p>
      </header>

      {terms.map((term) => (
        <section key={term.id} className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Term {term.id}</h2>
          <div className="space-y-2">
            {weeks.filter((w) => w.term_id === term.id).map((w) => {
              const unlocked = Date.parse(w.unlock_at) <= now;
              const items = (lessons ?? []).filter((l) => l.week_id === w.id);
              return (
                <div key={w.id} className={cn(
                  "rounded-lg border p-4",
                  unlocked ? "border-line bg-card" : "border-dashed border-line bg-transparent",
                )}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cn("text-sm font-medium", !unlocked && "text-muted-foreground")}>
                      Week {w.number}
                    </span>
                    {!unlocked && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        unlocks {new Date(w.unlock_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                  {unlocked && items.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {items.map((l) => (
                        <li key={l.id}>
                          <Link href={`/lessons/${l.id}`}
                            className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted">
                            <span className="min-w-0">
                              <MixedText text={l.title} className="text-sm" />
                              <span className="ml-2 text-xs text-muted-foreground">{SERIES[l.series]}</span>
                            </span>
                            {watched.has(l.id) && <span className="shrink-0 text-xs text-ok">✓</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {unlocked && items.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">No lessons this week.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
