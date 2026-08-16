import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { ClassBackdrop } from "@/components/app/class-backdrop";
import { HoverTip } from "@/components/app/hover-tip";
import { teacherNav, teacherMobileNav } from "@/lib/nav";
import { currentProfile } from "@/lib/supabase/server";
import { signedAvatarUrl } from "@/lib/account/avatar";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/home");
  return (
    <AppShell
      nav={teacherNav}
      mobileNav={teacherMobileNav}
      userName={profile.full_name}
      avatarSrc={await signedAvatarUrl(profile.avatar_url)}
      roleLabel="Teacher"
      backdrop={<ClassBackdrop className={profile.classes?.name ?? null} />}
    >
      {children}
      <HoverTip />
    </AppShell>
  );
}
