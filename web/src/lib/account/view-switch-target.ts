import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { ViewSwitchTarget } from "@/components/app/view-switch";

/** Where this person's switch leads, or nothing for anyone without a seat. A
 *  teacher can read every profile, so finding their own seat needs no admin. */
export async function viewSwitchFor(profile: {
  id: string; role: string; login_id: string | null;
}): Promise<ViewSwitchTarget | undefined> {
  if (profile.login_id) return { seatId: null, label: "Back to my class" };
  if (profile.role !== "teacher") return undefined;
  const db = await supabaseServer();
  const { data: seat } = await db.from("profiles").select("id").eq("login_id", profile.id).maybeSingle();
  return seat ? { seatId: seat.id, label: "Esteemed Ustadhs" } : undefined;
}
