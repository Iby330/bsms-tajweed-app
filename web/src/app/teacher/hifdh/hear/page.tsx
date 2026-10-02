import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The old hearing desk. Hearing now happens on the register's Hear tab, so
 * a bookmark lands there, with its `?student=` kept.
 */
export default async function HearRedirect({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  redirect(student ? `/teacher/hifdh?tab=hear&student=${encodeURIComponent(student)}` : "/teacher/hifdh?tab=hear");
}
