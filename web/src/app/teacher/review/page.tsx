import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { MixedText } from "@/components/app/mixed-text";

export const dynamic = "force-dynamic";

export default async function ReviewQueue() {
  const db = await supabaseServer();

  const { data: subs } = await db
    .from("submissions")
    .select("id, status, submitted_at, is_late, homework_id, student_id")
    .in("status", ["submitted", "auto_marked"])
    .order("submitted_at");

  const hwIds = [...new Set((subs ?? []).map((s) => s.homework_id))];
  const stuIds = [...new Set((subs ?? []).map((s) => s.student_id))];

  const [{ data: hws }, { data: people }] = await Promise.all([
    hwIds.length ? db.from("homeworks").select("id, number, title").in("id", hwIds) : Promise.resolve({ data: [] }),
    stuIds.length ? db.from("profiles").select("id, full_name, class_id").in("id", stuIds) : Promise.resolve({ data: [] }),
  ]);
  const { data: classes } = await db.from("classes").select("id, name");

  const hwById = new Map((hws ?? []).map((h) => [h.id, h]));
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const classById = new Map((classes ?? []).map((c) => [c.id, c.name]));

  const groups = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const list = groups.get(s.homework_id) ?? [];
    list.push(s);
    groups.set(s.homework_id, list);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Objective answers are already marked. Check the written ones, then approve.
        </p>
      </header>

      {!subs?.length ? (
        <p className="rounded-lg border border-line bg-card p-6 text-sm text-muted-foreground">
          Nothing waiting for review.
        </p>
      ) : (
        [...groups.entries()].map(([hwId, list]) => {
          const hw = hwById.get(hwId);
          return (
            <section key={hwId} className="space-y-2">
              <h2 className="text-sm font-medium">
                Homework {hw?.number}
                <MixedText text={hw?.title ? ` · ${hw.title}` : ""} className="text-muted-foreground" />
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                {(list ?? []).map((s) => {
                  const p = personById.get(s.student_id);
                  return (
                    <li key={s.id}>
                      <Link href={`/teacher/review/${s.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                        <span className="min-w-0">
                          <span className="text-sm font-medium">{p?.full_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {classById.get(p?.class_id ?? "") ?? ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs">
                          {s.is_late && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>}
                          <span className="text-muted-foreground">
                            {s.status === "auto_marked" ? "marked" : "unmarked"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
