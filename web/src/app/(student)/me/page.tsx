import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
import { StrikeDots } from "@/components/app/strike-dots";
import { SignOutButton } from "@/components/app/sign-out-button";

export const dynamic = "force-dynamic";

export default async function Me() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { terms } = await getTermsAndWeeks();
  const termId = currentTermId(terms);

  const [{ data: cls }, { data: strikes }] = await Promise.all([
    profile.class_id
      ? db.from("classes").select("name, section").eq("id", profile.class_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("strikes").select("reason, note, issued_at")
      .eq("student_id", profile.id).eq("term_id", termId).order("issued_at"),
  ]);

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <h1 className="text-2xl">{profile.full_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cls?.name ?? "No class assigned"}
        </p>
      </header>

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Strikes · Term {termId}
        </h2>
        <div className="mt-3">
          <StrikeDots strikes={(strikes ?? []) as never} />
        </div>
        {strikes?.length ? (
          <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
            {strikes.map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium capitalize text-foreground">{s.reason}</span>
                {s.note && ` — ${s.note}`}
                <span className="ml-1 tabular-nums">
                  ({s.issued_at ? new Date(s.issued_at).toLocaleDateString("en-GB") : "—"})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No strikes this term.</p>
        )}
      </section>

      <SignOutButton />
    </div>
  );
}
