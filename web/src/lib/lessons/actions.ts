"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { parseYouTubeId } from "./youtube";

/** Record that a lesson was watched. Fired by the player at ~90% playback. */
export async function markWatched(lessonId: string): Promise<void> {
  const profile = await currentProfile();
  if (!profile) throw new Error("Not signed in.");

  const db = await supabaseServer();
  await db
    .from("lesson_watches")
    .upsert(
      { student_id: profile.id, lesson_id: lessonId },
      { onConflict: "student_id,lesson_id" },
    );

  revalidatePath("/home");
  revalidatePath("/lessons");
  revalidatePath(`/lessons/${lessonId}`);
}

/**
 * Attach (or clear) the YouTube video for a lesson. Teachers paste a share
 * link; we store the bare id. Passing an empty string detaches the video —
 * that's how you undo a wrong paste.
 */
export async function setLessonVideo(
  lessonId: string,
  input: string,
): Promise<{ ok: true; youtubeId: string | null } | { ok: false; error: string }> {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") return { ok: false, error: "Teachers only." };

  const trimmed = input.trim();
  const youtubeId = trimmed ? parseYouTubeId(trimmed) : null;
  if (trimmed && !youtubeId) {
    return { ok: false, error: "That doesn't look like a YouTube link." };
  }

  const db = await supabaseServer();
  const { error } = await db
    .from("lessons")
    .update({ youtube_id: youtubeId })
    .eq("id", lessonId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/teacher/curriculum");
  revalidatePath("/lessons");
  revalidatePath("/home");
  return { ok: true, youtubeId };
}
