"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import type { PasswordResult } from "./password";

/** Matches the bucket's own limit — rejected here first so the error is a
 *  sentence rather than a storage exception. */
const MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/**
 * Store an uploaded profile picture.
 *
 * The file goes to `<user id>/avatar.<ext>` — a folder per person, which is
 * what the bucket policy checks, so nobody can write over anyone else's. The
 * path rather than a URL is kept on the profile: the bucket is private, and
 * every read mints a fresh signed URL.
 */
export async function saveAvatar(formData: FormData): Promise<PasswordResult> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image first." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "That image is over 2 MB. Try a smaller one." };
  }
  const ext = EXTENSIONS[file.type];
  if (!ext) {
    return { ok: false, message: "Use a JPG, PNG or WebP." };
  }

  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "You're not signed in." };

  const path = `${user.id}/avatar.${ext}`;

  // Read the old path before overwriting the row: swapping a JPG for a PNG
  // writes a *different* object, so without this the previous file would sit
  // in the bucket forever with nothing pointing at it.
  const { data: before } = await db
    .from("profiles").select("avatar_url").eq("id", user.id).single();

  const { error: uploadError } = await db.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { ok: false, message: uploadError.message };

  const { error } = await db.from("profiles").update({ avatar_url: path }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };

  if (before?.avatar_url && before.avatar_url !== path) {
    await db.storage.from("avatars").remove([before.avatar_url]);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Clear the picture and delete the stored file. Falls back to initials. */
export async function removeAvatar(): Promise<PasswordResult> {
  const db = await supabaseServer();
  const { data: userData } = await db.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "You're not signed in." };

  const { data: profile } = await db
    .from("profiles").select("avatar_url").eq("id", user.id).single();
  if (profile?.avatar_url) {
    await db.storage.from("avatars").remove([profile.avatar_url]);
  }

  const { error } = await db
    .from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
