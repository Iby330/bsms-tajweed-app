import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCachedPageWords, getCachedSurahs } from "@/lib/reference/cached";
import { fullMushafSurahs } from "@/lib/hifz/mushaf-reach";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { classmatesOf, classTarget, myDraft, overrides } from "@/lib/murajaah/queries";
import { firstPageOf } from "@/lib/murajaah/portions";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";
import { ListenerScreen } from "@/components/murajaah/listener/listener-screen";
import type { SurahNames } from "./mushaf-reader";

const LAST_PAGE = 604;
const BASE_PATH = "/hifdh?tab=review";

/** "Ustadh Mohamed" from the class's teacher, or a plain fallback. */
async function teacherNameOf(classId: string | null): Promise<string> {
  if (!classId) return "your teacher";
  const admin = supabaseAdmin();
  const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", classId).maybeSingle();
  if (!cls?.teacher_id) return "your teacher";
  const { data: t } = await admin.from("profiles").select("full_name").eq("id", cls.teacher_id).maybeSingle();
  const first = t?.full_name?.trim().split(/\s+/)[0];
  return first ? `Ustadh ${first}` : "your teacher";
}

/**
 * The ustadhs' Review tab: murāja'ah. Whoever is listening picks who is
 * reciting and the portion, times them and marks their mistakes (design C,
 * components/murajaah/listener). Below it, "My revision": their own
 * attempts as a reciter.
 *
 * The page shown comes from `?page=`; with none, an open draft opens at its
 * portion's first page. Everything else about the session is client state,
 * restored from `myDraft()` on load.
 */
export async function ListenTab({
  userId, classId, pageParam,
}: {
  userId: string;
  classId: string | null;
  /** Unused since murāja'ah: whoever is listening picks the reciter on the screen. */
  listenParam?: string;
  pageParam?: string;
}) {
  const [people, draft, target, overrideList, surahs, teacherName] = await Promise.all([
    classmatesOf(userId, classId),
    myDraft(),
    classId ? classTarget(classId) : Promise.resolve(DEFAULT_CLASS_TARGET),
    classId ? overrides(classId) : Promise.resolve([]),
    getCachedSurahs(),
    teacherNameOf(classId),
  ]);

  const requested = Number(pageParam);
  let page: number | null = null;
  if (pageParam && Number.isInteger(requested)) page = Math.min(Math.max(requested, 1), LAST_PAGE);
  else if (draft) page = firstPageOf(draft.kind, draft.ns);
  const rows = page ? await getCachedPageWords(page) : [];
  const surahNames: SurahNames = Object.fromEntries(
    fullMushafSurahs(surahs).map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );

  return (
    <div className="space-y-8">
      <ListenerScreen
        people={people}
        initialDraft={draft}
        serverNow={new Date().toISOString()}
        target={target}
        overrides={overrideList}
        teacherName={teacherName}
        pages={groupIntoPages(rows.map(fromRow))}
        surahNames={surahNames}
        basePath={BASE_PATH}
      />
    </div>
  );
}
