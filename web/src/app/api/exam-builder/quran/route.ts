import { currentProfile } from "@/lib/supabase/server";
import { loadQuranSnippets } from "@/lib/exam-builder/quran";
import { isQuranRef, parseSnippetKey, snippetKey } from "@/lib/exam-builder/quran-lines";

/** Ranges one batch may ask for; the client sends at most this many per request. */
const MAX_REFS = 60;

/**
 * The words of one ayah range, for the builder to typeset a question's ayah
 * (`<QuranSnippet words={…} />`) as the teacher types the reference in.
 *
 * GET /api/exam-builder/quran?surah=31&from=19&to=19[&fromWord=3][&toWord=7]
 * → SnippetWord[] (200), [] when the range holds no words.
 *
 * Or many at once, as a bank view asks for its cards' words together:
 * GET /api/exam-builder/quran?ref=31:19-19&ref=2:27-27@5-6 (snippetKey form,
 * at most MAX_REFS) → { [key]: SnippetWord[] }, a key left out when its range
 * holds no words.
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
  const keys = q.getAll("ref");
  if (keys.length > 0) {
    if (keys.length > MAX_REFS) return Response.json({ error: `At most ${MAX_REFS} ranges at once.` }, { status: 400 });
    const refs = keys.map(parseSnippetKey).filter((r) => r !== null);
    const byKey = await loadQuranSnippets(refs);
    return Response.json(byKey, { headers: { "Cache-Control": "private, max-age=86400" } });
  }
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
