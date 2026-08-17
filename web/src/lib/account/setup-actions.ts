"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkPassword, humanisePasswordError, type PasswordResult } from "./password";

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

  const fullName = `${first} ${last}`;
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { ok: false, message: "This invitation has expired. Ask for a new one." };
  }

  // The password and the display name go up together. `data` writes
  // `raw_user_meta_data.full_name`, which is what the Supabase dashboard shows
  // as Display name — accounts were seeded with placeholder surnames, and
  // without this the name someone types here never reaches that column, so the
  // dashboard keeps naming people something they are not.
  const { error: pwError } = await db.auth.updateUser({
    password,
    data: { full_name: fullName },
  });
  if (pwError) {
    return { ok: false, message: humanisePasswordError(pwError.message) };
  }

  // Service role, deliberately. `profiles` has no UPDATE policy for a student —
  // t_profiles requires is_teacher() and s_profiles_own is SELECT-only — so a
  // student's own setup wrote nothing at all and returned no error, leaving
  // setup_complete false and the setup gate sending them back here forever.
  // The id is the one the Auth server just returned for this session, never
  // anything the form supplied, and only these two columns are written.
  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ full_name: fullName, setup_complete: true })
    .eq("id", user.id);
  if (error) return { ok: false, message: "Saved your password, but not your name. Set it on your account page." };

  revalidatePath("/", "layout");
  return { ok: true };
}
