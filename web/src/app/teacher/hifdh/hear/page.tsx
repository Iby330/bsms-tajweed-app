import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The old hearing desk. Hearing now happens on each student's Hear tab, so
 * a bookmark with `?student=` lands on that tab, and one without lands on
 * the register.
 */
export default async function HearRedirect({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  redirect(student ? `/teacher/hifdh/${encodeURIComponent(student)}?tab=hear` : "/teacher/hifdh");
}
