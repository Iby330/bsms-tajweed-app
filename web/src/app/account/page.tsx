import type { Metadata } from "next";
import { AvatarForm } from "@/components/app/avatar-form";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { NameForm } from "@/components/app/name-form";
import { signedAvatarUrl } from "@/lib/account/avatar";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";

/** Two initials for the picture placeholder; never throws on a one-word name. */
function initialsOf(name: string) {
  return name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export const metadata: Metadata = { title: "Account" };

/** The session is the whole point of this page — never serve it from cache. */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  // The layout has already turned away anyone without a profile.
  const profile = (await currentProfile())!;

  // Email lives on the auth user, not on `profiles`.
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();

  const teacher = profile.role === "teacher";

  return (
    <>
      <header className="masthead">
        <h1><span>Account</span></h1>
        <p>Your details, and the password you sign in with.</p>
        <div className="meta">
          <span className="label">{teacher ? "Teacher" : "Student"}</span>
          {profile.classes?.name && (
            <span className="label hi">{profile.classes.name}</span>
          )}
        </div>
      </header>

      <div className="field">
        <section className="box c12">
          <span className="label">You</span>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {!teacher && (
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="font-semibold">{profile.full_name}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="font-semibold break-all">{data.user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Section</dt>
              <dd className="font-semibold capitalize">{profile.section}</dd>
            </div>
            {profile.classes?.name && (
              <div>
                <dt className="text-xs text-muted-foreground">Class</dt>
                <dd className="font-semibold">{profile.classes.name}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            {teacher
              ? "Your email is set by the programme lead. Ask if it needs changing."
              : "Your name, class and email are set by your teacher. Ask them if something here is wrong."}
          </p>
        </section>

        <section className="box c12">
          <span className="label">Profile picture</span>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            Shown beside your name in the sidebar. Entirely optional — your
            initials stand in when there isn&rsquo;t one.
          </p>
          <AvatarForm
            currentSrc={await signedAvatarUrl(profile.avatar_url)}
            initials={initialsOf(profile.full_name)}
          />
        </section>

        {teacher && (
          <section className="box c12">
            <span className="label">Your name</span>
            <p className="mt-2 mb-5 max-w-[65ch] text-sm text-muted-foreground">
              Accounts are handed over rather than created, so yours arrived with a
              placeholder. Put your real name in and it updates everywhere at once.
            </p>
            <NameForm initial={profile.full_name} />
          </section>
        )}

        <section className="box c12">
          <span className="label">Change password</span>
          <div className="mt-3">
            <ChangePasswordForm />
          </div>
        </section>
      </div>
    </>
  );
}
