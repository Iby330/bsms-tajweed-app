import { currentProfile } from "@/lib/supabase/server";
import { getCachedPageWords } from "@/lib/reference/cached";
import { LAST_PAGE } from "@/lib/quran/page-within";
import { firstReadablePage } from "@/lib/hifz/mushaf-reach";

/**
 * One mushaf page's words, for turning the page in the browser.
 *
 * The mushaf pagers used to turn a page by navigating, which re-rendered the
 * whole tab on the server — roster, hearings, partner revision and all — to
 * swap fifteen lines of text. This hands over just those lines, from the same
 * cross-request cache the page render reads, so a turn is one small request
 * (and none at all once a neighbour has been prefetched).
 *
 * Each reader gets the pages their own mushaf reaches and no others: a
 * teacher, the whole of it; the ustadhs' section, the whole of it; everyone
 * else, the programme's range (`firstReadablePage`), the same limit the pages
 * themselves apply.
 *
 * A GET rather than a server action because actions run one at a time per
 * tab, and a prefetch queued behind them would hold up the tap-to-save writes
 * made while someone recites.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  const profile = await currentProfile();
  if (!profile) return Response.json({ error: "Not signed in." }, { status: 401 });
  const first = profile.role === "teacher" ? 1 : firstReadablePage(profile.section);
  const page = Number((await params).page);
  if (!Number.isInteger(page) || page < first || page > LAST_PAGE) {
    return Response.json({ error: "No such page." }, { status: 404 });
  }
  const rows = await getCachedPageWords(page);
  // The text of a page never changes; the browser may keep it for the day.
  return Response.json(rows, { headers: { "Cache-Control": "private, max-age=86400" } });
}
