import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { studentNav, studentMobileNav } from "@/lib/nav";
import { currentProfile } from "@/lib/supabase/server";

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
      roleLabel="Student"
    >
      {children}
    </AppShell>
  );
}
