import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { expectedPassed, paceStatus } from "@/lib/hifz/pace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeacherHifz({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classParam } = await searchParams;
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { weeks } = await getTermsAndWeeks();

  const { data: classes } = await db.from("classes").select("id, name, section").order("section").order("name");
  const mine = (classes ?? []).find((c) => c.id === classParam)
    ?? (await db.from("classes").select("id, name, section").eq("teacher_id", profile.id).maybeSingle()).data
    ?? classes?.[0];
  if (!mine) return <p className="text-sm text-muted-foreground">No classes yet.</p>;

  const { data: students } = await db
    .from("profiles").select("id, full_name")
    .eq("class_id", mine.id).eq("role", "student").eq("is_active", true).order("full_name");
  const ids = (students ?? []).map((s) => s.id);

  const { data: progress } = ids.length
    ? await db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids)
    : { data: [] };
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));

  const { data: surahs } = await db.from("surahs").select("number, name_en, order_index").order("order_index");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Hifz register</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thursday recitation. Colour shows each student against the calendar.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {(classes ?? []).map((c) => (
            <Link key={c.id} href={`/teacher/hifz?class=${c.id}`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                c.id === mine.id ? "border-ink bg-ink text-primary-foreground" : "border-line hover:bg-muted",
              )}>
              {c.name}
            </Link>
          ))}
        </nav>
      </header>

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {(students ?? []).map((s) => {
          const p = byStudent.get(s.id);
          const target = p ? Number(p.target_count) : 0;
          const passed = p ? Number(p.passed) : 0;
          const expected = expectedPassed(new Date(), weeks, target);
          const status = paceStatus(passed, expected);
          const next = (surahs ?? [])[passed];
          return (
            <li key={s.id}>
              <Link href={`/teacher/hifz/${s.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/60">
                <span className="min-w-0">
                  <span className="text-sm font-medium">{s.full_name}</span>
                  {next && (
                    <span className="ml-2 text-xs text-muted-foreground">next: {next.name_en}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {passed}/{target || "—"} · expected {expected}
                  </span>
                  <span className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    !p && "bg-muted text-muted-foreground",
                    p && status === "ok" && "bg-ok/12 text-ok",
                    p && status === "warn" && "bg-warn/12 text-warn",
                    p && status === "danger" && "bg-danger/12 text-danger",
                  )}>
                    {!p ? "no target" : status === "ok" ? "ahead" : status === "warn" ? "on pace" : "behind"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!students?.length && (
        <p className="rounded-lg border border-line bg-card p-6 text-sm text-muted-foreground">
          No students in this class yet.
        </p>
      )}
    </div>
  );
}
