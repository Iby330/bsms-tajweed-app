"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

/**
 * Record where a student's voice note landed in Storage. The upload itself
 * happens straight from the browser (audio never round-trips through the
 * server); this just points the submission at it. RLS does the enforcing —
 * the policies only allow a student to touch their own draft.
 */
export async function saveVoiceNote(
  submissionId: string,
  questionId: string,
  storagePath: string,
  durationS: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await currentProfile();
  if (!profile) return { ok: false, error: "Not signed in." };

  const db = await supabaseServer();
  const { error } = await db.from("voice_notes").upsert(
    {
      submission_id: submissionId,
      question_id: questionId,
      storage_path: storagePath,
      duration_s: Math.round(durationS),
    },
    { onConflict: "submission_id,question_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/homework");
  return { ok: true };
}

/** Drop a recording so it can be done again. */
export async function deleteVoiceNote(
  submissionId: string,
  questionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await supabaseServer();
  const { error } = await db
    .from("voice_notes")
    .delete()
    .eq("submission_id", submissionId)
    .eq("question_id", questionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/homework");
  return { ok: true };
}
