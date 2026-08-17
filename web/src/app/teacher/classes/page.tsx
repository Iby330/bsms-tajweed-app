import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { Rule } from "@/components/app/rule";
import { canOpenSection, SECTION_POSSESSIVE } from "@/lib/teacher/scope";
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

  // A teacher on the demo cohort is being shown round the app, not the
  // programme: their own training class is the only one that means anything to
  // them, and the real classes would list colleagues they have not met and
  // rosters they cannot open. Everyone else sees the two real cohorts and not
  // the training classes, which are noise on this page.
  const sections =
    profile?.section === "demo" ? (["demo"] as const) : (["brothers", "sisters"] as const);

  const teacherName = new Map((people ?? []).filter((p) => p.role === "teacher").map((p) => [p.id, p.full_name]));
  const counts = new Map<string, number>();
  for (const p of people ?? []) {
    if (p.role === "student" && p.class_id) counts.set(p.class_id, (counts.get(p.class_id) ?? 0) + 1);
  }

  return (
    <>
      <header className="masthead">
        <h1><span>Classes</span></h1>
        <p>
          {profile?.section === "demo"
            ? "Your training class. It is made of demo students, so nothing you do here touches a real record."
            : "All seven classes across the programme. Every class is listed; the ones in your own section open."}
        </p>
      </header>

      {/* No `space-y-*` here: the utility writes a margin onto every child but
          the last, which outranks `.divider`'s own and cost these headings the
          whole rhythm of the page. `.field` spaces the panel instead. */}
      {sections.map((section) => {
        const inSection = (classes ?? []).filter((c) => c.section === section);
        // A section with no classes would otherwise draw an empty hairline frame.
        if (inSection.length === 0) return null;

        // Whole sections open or they do not, so the reason is said once under
        // the heading rather than repeated down every row of somebody else's
        // cohort. The rows themselves differ only in being links or not.
        const openable = canOpenSection(profile?.section, section);

        return (
        <section key={section}>
          <Rule label={section} />
          {!openable && (
            <p className="mb-2 text-xs text-muted-foreground">
              Listed for reference. Only {SECTION_POSSESSIVE[section] ?? "their own"} teachers
              can open these.
            </p>
          )}
          <div className="field">
          <ul className="box c12 divide-y divide-line" style={{ padding: 0, gap: 0 }}>
            {inSection.map((c) => {
              const isMine = c.id === mineId;
              const row = (
                <>
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
                </>
              );

              const shape = cn(
                "flex items-center justify-between gap-3 px-4 py-3",
                isMine && "bg-muted/40",
              );

              // Your own class goes to the Roster, not to the read-only view of
              // it — that page is for looking into someone else's, and yours is
              // the one you can actually mark, register and sign off.
              const href = isMine ? "/teacher/roster" : `/teacher/classes/${c.id}`;

              return (
                <li key={c.id}>
                  {openable ? (
                    <Link
                      href={href}
                      className={cn(
                        shape,
                        "transition-colors hover:bg-muted/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      )}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className={shape}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
          </div>
        </section>
        );
      })}
    </>
  );
}
