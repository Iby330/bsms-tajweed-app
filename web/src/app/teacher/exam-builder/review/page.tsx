import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review the bank" };
export const dynamic = "force-dynamic";

/**
 * Admin-only review of imported questions. Anyone else gets a 404, not a
 * "not allowed": the page should not be discoverable. RLS is the real guard
 * on the bank; this only hides the screen. Placeholder until plan Task 6.
 */
export default async function ReviewBank() {
  if (!(await currentProfile())?.is_admin) notFound();
  return (
    <header className="masthead">
      <h1><span>Review the bank</span></h1>
      <p>Coming together…</p>
    </header>
  );
}
