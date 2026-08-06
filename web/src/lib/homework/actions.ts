"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { isLate } from "./logic";

/**
 * Student-side homework actions. These use the *user* client, so RLS enforces
 * ownership — a student can only ever touch their own draft.
 */

async function requireStudent() {
  const profile = await currentProfile();
  if (!profile) throw new Error("Not signed in.");
  return profile;
}

/** Get-or-create the draft submission for this homework. */
export async function ensureSubmission(homeworkId: string): Promise<string> {
  const profile = await requireStudent();
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("submissions")
    .select("id")
    .eq("homework_id", homeworkId)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("submissions")
    .insert({ homework_id: homeworkId, student_id: profile.id, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Autosave one answer. Silently no-ops once the work has been submitted. */
export async function saveAnswer(
  submissionId: string,
  questionId: string,
  response: unknown,
): Promise<void> {
  const db = await supabaseServer();
  const { data: sub } = await db
    .from("submissions").select("status").eq("id", submissionId).maybeSingle();
  if (!sub || sub.status !== "draft") return;

  await db
    .from("answers")
    .upsert(
      { submission_id: submissionId, question_id: questionId, response: response as never },
      { onConflict: "submission_id,question_id" },
    );
}

/**
 * Hand the work in. Late submissions are accepted and flagged — mid-year
 * joiners have to catch up, and lateness is a teacher's judgement (a strike),
 * not an automatic block.
 */
export async function submitHomework(submissionId: string): Promise<void> {
  const db = await supabaseServer();

  const { data: sub } = await db
    .from("submissions")
    .select("id, status, homework_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub || sub.status !== "draft") return;

  const { data: hw } = await db
    .from("homeworks").select("due_at, number").eq("id", sub.homework_id).single();

  await db
    .from("submissions")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      is_late: isLate(new Date(), hw?.due_at ?? null),
    })
    .eq("id", submissionId);

  revalidatePath(`/homework/${hw?.number ?? ""}`);
  revalidatePath("/homework");
  revalidatePath("/home");
}
