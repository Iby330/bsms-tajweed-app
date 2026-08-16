import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { ClassBackdrop } from "@/components/app/class-backdrop";
import { HoverTip } from "@/components/app/hover-tip";
import { studentNav, studentMobileNav } from "@/lib/nav";
import { currentProfile } from "@/lib/supabase/server";
import { signedAvatarUrl } from "@/lib/account/avatar";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "teacher") redirect("/teacher/home");
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
