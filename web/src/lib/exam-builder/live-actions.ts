"use server";

/**
 * Two teachers on one paper (0155). The builder calls `pulsePaper` every ~10 s
 * while its tab is visible: that marks the caller as here, and answers who
 * else is here and when the paper last changed (and by whom). When someone
 * else changed it, the builder fetches the whole paper again with
 * `reloadPaper` and swaps it in, unless the teacher is mid-edit. No Realtime:
 * a poll is enough for a handful of teachers, and nothing here revalidates.
 */
import { supabaseServer } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/teacher/guards";
import { loadPaper, type LoadedPaper } from "./queries";
import type { PaperStatus, Result } from "./types";
import { isUuid } from "./validate";

/** A teacher counts as "here" if their builder pulsed within this long. */
const HERE_MS = 30_000;

export type Pulse =
  | { gone: true }
  | {
      gone: false;
      updatedAt: string;
      updatedBy: string | null;
      status: PaperStatus;
      shared: boolean;
      /** The other teachers with the paper open now, by first name order. */
      others: { id: string; name: string }[];
    };

export async function pulsePaper(paperId: string): Promise<Result<{ pulse: Pulse }>> {
  if (!isUuid(paperId)) return { ok: true, pulse: { gone: true } };
  let me: Awaited<ReturnType<typeof requireTeacher>>;
  try {
    me = await requireTeacher();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Teachers only." };
  }
  const db = await supabaseServer();

  const { data: paper, error } = await db
    .from("exam_papers").select("updated_at, updated_by, status, shared").eq("id", paperId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  // Deleted, or made private by its owner: this teacher can't see it any more.
  if (!paper) return { ok: true, pulse: { gone: true } };

  const now = new Date();
  const [, here] = await Promise.all([
    db.from("exam_paper_presence")
      .upsert({ paper_id: paperId, profile_id: me.id, seen_at: now.toISOString() }, { onConflict: "paper_id,profile_id" }),
    db.from("exam_paper_presence")
      .select("profile_id, profiles(full_name)")
      .eq("paper_id", paperId)
      .neq("profile_id", me.id)
      .gte("seen_at", new Date(now.getTime() - HERE_MS).toISOString()),
  ]);
  const others = (here.data ?? [])
    .map((r) => ({ id: r.profile_id, name: r.profiles?.full_name?.trim() || "Another teacher" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    pulse: {
      gone: false,
      updatedAt: paper.updated_at,
      updatedBy: paper.updated_by,
      status: paper.status === "final" ? "final" : "draft",
      shared: paper.shared,
      others,
    },
  };
}

/** Leaving the builder: stop showing as here (best effort; the 30 s window covers a lost call). */
export async function leavePaper(paperId: string): Promise<Result> {
  if (!isUuid(paperId)) return { ok: true };
  try {
    const me = await requireTeacher();
    const db = await supabaseServer();
    await db.from("exam_paper_presence").delete().eq("paper_id", paperId).eq("profile_id", me.id);
  } catch {
    // Nothing to tell the teacher: they are leaving.
  }
  return { ok: true };
}

/** The whole paper again, as the builder page loads it. Null when it is gone. */
export async function reloadPaper(paperId: string): Promise<Result<{ paper: LoadedPaper | null }>> {
  try {
    await requireTeacher();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Teachers only." };
  }
  try {
    return { ok: true, paper: await loadPaper(paperId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't load the paper." };
  }
}
