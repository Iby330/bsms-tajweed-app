import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { ClassBackdrop } from "@/components/app/class-backdrop";
import { HoverTip } from "@/components/app/hover-tip";
import { studentNav, studentMobileNav } from "@/lib/nav";
import { currentProfile } from "@/lib/supabase/server";
import { NO_PROFILE_PATH } from "@/lib/no-profile";
import { requireSetup } from "@/lib/account/require-setup";
import { signedAvatarUrl } from "@/lib/account/avatar";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await currentProfile();
  // Not /login: the proxy bounces a signed-in visitor off it, back here.
  if (!profile) redirect(NO_PROFILE_PATH);
  if (profile.role === "teacher") redirect("/teacher/home");
  requireSetup(profile);
  if (!profile.is_active) redirect("/locked");
  return (
    <AppShell
      nav={studentNav}
      mobileNav={studentMobileNav}
      userName={profile.full_name}
      avatarSrc={await signedAvatarUrl(profile.avatar_url)}
      roleLabel="Student"
      backdrop={<ClassBackdrop className={profile.classes?.name ?? null} />}
    >
      {children}
      <HoverTip />
    </AppShell>
  );
}
