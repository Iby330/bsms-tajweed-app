import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { teacherNav, teacherMobileNav } from "@/lib/nav";
import { currentProfile } from "@/lib/supabase/server";

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
      roleLabel="Teacher"
    >
      {children}
    </AppShell>
  );
}
