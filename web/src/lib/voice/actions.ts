"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { voiceResponse } from "@/lib/homework/logic";

/**
 * Record where a student's voice note landed in Storage. The upload itself
 * happens straight from the browser (audio never round-trips through the
 * server); this just points the submission at it. RLS does the enforcing —
 * the policies only allow a student to touch their own draft.
 *
 * An `answers` row goes in alongside, carrying the path as its response. That
 * row is what the teacher's comment hangs off, and what stops a recitation
 * from being counted blank in the class stats; a task scores 0 either way, so
 * it never reaches the marking model.
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
  const [note, answer] = await Promise.all([
    db.from("voice_notes").upsert(
      {
        submission_id: submissionId,
        question_id: questionId,
        storage_path: storagePath,
        duration_s: Math.round(durationS),
      },
      { onConflict: "submission_id,question_id" },
    ),
    db.from("answers").upsert(
      {
        submission_id: submissionId,
        question_id: questionId,
        response: voiceResponse(storagePath) as never,
      },
      { onConflict: "submission_id,question_id" },
    ),
  ]);
  const error = note.error ?? answer.error;
  if (error) return { ok: false, error: error.message };

  revalidatePath("/homework/[n]", "page");
  return { ok: true };
}

/**
 * Drop a recording so it can be done again — both rows, or the answer left
 * behind would still claim a recitation that no longer exists. The answer
 * goes second: if RLS refuses it the note is already gone, and a task with no
 * answer row renders the same as one that was never recorded.
 */
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

  const { error: answerError } = await db
    .from("answers")
    .delete()
    .eq("submission_id", submissionId)
    .eq("question_id", questionId);
  if (answerError) return { ok: false, error: answerError.message };

  revalidatePath("/homework/[n]", "page");
  return { ok: true };
}
