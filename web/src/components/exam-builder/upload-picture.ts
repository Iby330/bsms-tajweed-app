"use client";

/**
 * A teacher's picture, uploaded from the browser straight to the
 * exam-questions bucket under `new/<profile id>/`, then signed by the server
 * so it shows at once. Shared by "Write a new question" and the question
 * editor (a picture under the question, or in an answer option).
 */
import { signNewQuestionImage } from "@/lib/exam-builder/new-question-actions";
import { supabaseBrowser } from "@/lib/supabase/client";

const BUCKET = "exam-questions";
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export const PICTURE_ACCEPT = Object.keys(TYPES).join(",");

export type Uploaded = { ok: true; path: string; url: string } | { ok: false; error: string };

export async function uploadPicture(file: File, profileId: string): Promise<Uploaded> {
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Choose a PNG, JPEG, WebP or GIF picture." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That picture is over 3 MB. Crop it or save it smaller." };
  try {
    const path = `new/${profileId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
    const signed = await signNewQuestionImage(path);
    if (!signed.ok) throw new Error(signed.error);
    return { ok: true, path, url: signed.url };
  } catch {
    return { ok: false, error: "The picture didn't upload. Check the connection and try again." };
  }
}
