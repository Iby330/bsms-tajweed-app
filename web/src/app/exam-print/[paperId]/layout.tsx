import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { NO_PROFILE_PATH } from "@/lib/no-profile";
import { requireSetup } from "@/lib/account/require-setup";
import "./print.css";

/**
 * The printed exam paper: deliberately OUTSIDE the teacher shell, so the page
 * is nothing but the paper (no nav, no backdrop) and the browser's own
 * "Save as PDF" gives the file. Same guard as app/teacher/layout.tsx.
 *
 * `.exam-print` pins its subtree to paper colours whatever the viewer's theme:
 * print.css resets the tokens inside it and, through `html:has(.exam-print)`,
 * the page ground and the film grain around it.
 */
export default async function ExamPrintLayout({ children }: { children: React.ReactNode }) {
  const profile = await currentProfile();
  // Not /login: the proxy bounces a signed-in visitor off it, back here.
  if (!profile) redirect(NO_PROFILE_PATH);
  if (profile.role !== "teacher") redirect("/home");
  requireSetup(profile);
  return <div className="exam-print">{children}</div>;
}
