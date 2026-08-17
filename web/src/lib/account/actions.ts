"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "./recovery";
import { checkPassword, humanisePasswordError, type PasswordResult } from "./password";

/**
 * Set your own display name.
 *
 * Teachers only. `profiles.full_name` is the single place a person's name is
 * stored, so whatever they type here is what the register, the roster, the
 * deposit tracker and the audit trail all show from that moment — there is no
 * second copy to keep in step.
 *
 * Students can't reach this: their name is the one their teacher enrolled them
 * under, and letting a class rename itself would make a register useless.
 */
export async function setOwnName(fullName: string): Promise<PasswordResult> {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") {
    return { ok: false, message: "Teachers only." };
  }
  const name = fullName.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, message: "Give your full name." };
  if (name.length > 80) return { ok: false, message: "That name is too long." };

  const db = await supabaseServer();
  const { error } = await db.from("profiles").update({ full_name: name }).eq("id", profile.id);
  // Not the password humaniser, which this used to borrow: a failure to save a
  // NAME answering "Something went wrong updating your password" is a message
  // about the wrong thing entirely.
  if (error) return { ok: false, message: "Something went wrong saving your name. Try again." };

  // The app reads names from `profiles` alone, but the Supabase dashboard reads
  // `raw_user_meta_data.full_name`, so a rename that stops here leaves the
  // Users table still calling them by the placeholder name their account was
  // seeded with. Not fatal if it fails — the app is already correct — so the
  // name change is not reported as a failure over it.
  await db.auth.updateUser({ data: { full_name: name } });

  // Every screen that shows a name reads it from profiles, and most are
  // cached per-route, so the whole shell needs re-rendering rather than /account.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Change the password of the person already signed in.
 *
 * The current password is checked by actually signing in with it on a
 * throwaway client — there is no "verify this password" endpoint, and a
 * failed sign-in is the only honest test. That client persists nothing and
 * shares no storage with the caller's session, so the cookies in this request
 * are untouched either way.
 *
 * It is deliberately NOT signed out afterwards: `signOut()` defaults to global
 * scope, which would revoke every session this user has — including the one
 * making this request, and their phone. The extra refresh token it mints is
 * unreferenced and expires on its own.
 *
 * `current_password` goes to `updateUser` as well. Supabase only enforces it
 * when the project has "require current password" switched on; passing it
 * means turning that setting on later tightens this path automatically
 * instead of silently doing nothing.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<PasswordResult> {
  const complaint = checkPassword(newPassword, confirmPassword);
  if (complaint) return { ok: false, message: complaint };

  const db = await supabaseServer();

  // getUser() over getClaims(): this asks the Auth server rather than reading
  // a locally-verified token, and the email it returns is what the sign-in
  // check below depends on being right.
  const { data: userData } = await db.auth.getUser();
  const email = userData.user?.email;
  if (!email) return { ok: false, message: "You're not signed in." };

  const probe = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: wrongPassword } = await probe.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (wrongPassword) {
    return { ok: false, message: "That isn't your current password." };
  }

  const { error } = await db.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (error) return { ok: false, message: humanisePasswordError(error.message) };

  return { ok: true };
}

/**
 * Set a new password for someone who arrived through a reset email.
 *
 * No current password is asked for — they came here because they don't have
 * it. What stands in for it is the recovery cookie, which only /auth/confirm
 * can mint and only after redeeming a real `type=recovery` token. A session
 * alone is not enough to reach this.
 */
export async function setPasswordAfterRecovery(
  newPassword: string,
  confirmPassword: string,
): Promise<PasswordResult> {
  const store = await cookies();
  if (!store.get(RECOVERY_COOKIE)) {
    return {
      ok: false,
      message: "That reset link has expired. Ask for a new one.",
    };
  }

  const complaint = checkPassword(newPassword, confirmPassword);
  if (complaint) return { ok: false, message: complaint };

  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) {
    return {
      ok: false,
      message: "That reset link has expired. Ask for a new one.",
    };
  }

  const { error } = await db.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: humanisePasswordError(error.message) };

  // Spent. Leaving it would let the next person at this browser set the
  // password again without a fresh link.
  store.delete(RECOVERY_COOKIE);

  return { ok: true };
}
