import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Classes() {
  const db = await supabaseServer();
  // Neither list waits on the other, and the profile already carries what the
  // teacher's own class would have cost a third round trip to look up.
  const [profile, { data: classes }, { data: people }] = await Promise.all([
    currentProfile(),
    db.from("classes").select("id, name, section, teacher_id").order("section").order("name"),
    db.from("profiles").select("id, full_name, role, class_id"),
  ]);

  // Same precedence as teacherClass(): the class you own, else the one you were given.
  const mineId =
    (classes ?? []).find((c) => c.teacher_id === profile?.id)?.id ?? profile?.class_id ?? null;

  const teacherName = new Map((people ?? []).filter((p) => p.role === "teacher").map((p) => [p.id, p.full_name]));
  const counts = new Map<string, number>();
  for (const p of people ?? []) {
    if (p.role === "student" && p.class_id) counts.set(p.class_id, (counts.get(p.class_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Classes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All seven classes across the programme. Your own screens — homework,
          register, roster and hifz — cover your class only; opening someone
          else&apos;s class from here arrives with admin accounts.
        </p>
      </header>

      {(["brothers", "sisters"] as const).map((section) => (
        <section key={section} className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">{section}</h2>
          <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
            {(classes ?? []).filter((c) => c.section === section).map((c) => {
              const isMine = c.id === mineId;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-3",
                    isMine && "bg-muted/40",
                  )}
                >
                  <span>
                    <span className="text-sm font-medium">{c.name}</span>
                    {isMine && (
                      <span className="ml-2 rounded bg-ok/12 px-1.5 py-0.5 text-[11px] font-medium text-ok">
                        yours
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.teacher_id ? teacherName.get(c.teacher_id) : "no teacher assigned"}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {counts.get(c.id) ?? 0} students
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
