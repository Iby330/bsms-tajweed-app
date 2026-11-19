import { currentProfile } from "@/lib/supabase/server";
import { loadQuranSnippets } from "@/lib/exam-builder/quran";
import { isQuranRef, snippetKey } from "@/lib/exam-builder/quran-lines";

/**
 * The words of one ayah range, for the builder to typeset a question's ayah
 * (`<QuranSnippet words={…} />`) as the teacher types the reference in.
 *
 * GET /api/exam-builder/quran?surah=31&from=19&to=19[&fromWord=3][&toWord=7]
 * → SnippetWord[] (200), [] when the range holds no words.
 *
 * Teachers only, like the builder itself. A GET rather than a server action:
 * actions run one at a time per tab and this would queue behind the builder's
 * saves (LEARNINGS, Hear-tab page turns).
 */
export async function GET(request: Request) {
  const profile = await currentProfile();
  if (!profile) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (profile.role !== "teacher") return Response.json({ error: "Teachers only." }, { status: 403 });

  const q = new URL(request.url).searchParams;
  const num = (k: string) => (q.get(k) == null || q.get(k) === "" ? undefined : Number(q.get(k)));
  const ref = {
    surah: num("surah"),
    from_ayah: num("from"),
    to_ayah: num("to") ?? num("from"),
    from_word: num("fromWord"),
    to_word: num("toWord"),
  };
  if (!isQuranRef(ref)) return Response.json({ error: "No such ayah range." }, { status: 400 });

  const words = (await loadQuranSnippets([ref]))[snippetKey(ref)] ?? [];
  // The text of the Qur'an never changes; the browser may keep it for the day.
  return Response.json(words, { headers: { "Cache-Control": "private, max-age=86400" } });
}
