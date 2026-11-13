import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import {
  studentNav, studentMobileNav, teacherNav, teacherMobileNav,
} from "@/lib/nav";
import { currentProfile } from "@/lib/supabase/server";
import { viewSwitchFor } from "@/lib/account/view-switch-target";
import { NO_PROFILE_PATH } from "@/lib/no-profile";
import { requireSetup } from "@/lib/account/require-setup";
import { signedAvatarUrl } from "@/lib/account/avatar";

/**
 * Account sits outside the (student) and teacher groups because both roles
 * need it, so it picks its own nav rather than inheriting one.
 *
 * Deliberately no `is_active` gate. The student layout sends inactive students
 * to /locked, but locking someone out of the programme is not a reason to lock
 * them out of their own password — and the reset flow can land here.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await currentProfile();
  // Not /login: the proxy bounces a signed-in visitor off it, back here.
  if (!profile) redirect(NO_PROFILE_PATH);
  requireSetup(profile);
  // Independent round trips (Storage, profiles): start both at once.
  const [avatarSrc, viewSwitch] = await Promise.all([
    signedAvatarUrl(profile.avatar_url),
    viewSwitchFor(profile),
  ]);

  const teacher = profile.role === "teacher";
  return (
    <AppShell
      nav={teacher ? teacherNav : studentNav}
      mobileNav={teacher ? teacherMobileNav : studentMobileNav}
      userName={profile.full_name}
      avatarSrc={avatarSrc}
      viewSwitch={viewSwitch}
      roleLabel={teacher ? "Teacher" : "Student"}
    >
      {children}
    </AppShell>
  );
}
