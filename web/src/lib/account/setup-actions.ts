"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { checkPassword, type PasswordResult } from "./password";

/**
 * Finish setting up an invited account: name, password, and optionally a photo.
 *
 * The email is never a parameter. It is whatever address the invitation was
 * sent to, and it is read from the session here rather than accepted from the
 * form — otherwise an invited teacher could point their account at somebody
 * else's address on the way in.
 */
export async function completeSetup(
  firstName: string,
  lastName: string,
  password: string,
  confirmPassword: string,
): Promise<PasswordResult> {
  const first = firstName.trim().replace(/\s+/g, " ");
  const last = lastName.trim().replace(/\s+/g, " ");
  if (!first) return { ok: false, message: "Enter your first name." };
  if (!last) return { ok: false, message: "Enter your last name." };

  const complaint = checkPassword(password, confirmPassword);
  if (complaint) return { ok: false, message: complaint };

  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false, message: "This invitation has expired. Ask for a new one." };
  }

  const { error: pwError } = await db.auth.updateUser({ password });
  if (pwError) {
    return { ok: false, message: "That password wasn't accepted. Try a longer one." };
  }

  const { error } = await db
    .from("profiles")
    .update({ full_name: `${first} ${last}`, setup_complete: true })
    .eq("id", user.id);
  if (error) return { ok: false, message: "Saved your password, but not your name. Set it on your account page." };

  revalidatePath("/", "layout");
  return { ok: true };
}
