import {
  draftMistakes, myActivePair, myDraftSession, partnerRange,
} from "@/lib/hifz/review-queries";
import {
  getCachedPageWords, getCachedSurahs, getCachedSurahStartPages,
} from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import type { SurahNames } from "./mushaf-reader";
import { ReviewLogger } from "./review-logger";
import { StartReviewButton } from "./start-review-button";
import { LAST_PAGE } from "@/lib/quran/page-within";
import { PROGRAMME_FIRST_PAGE as FIRST_FONT_PAGE } from "@/lib/hifz/mushaf-reach";


/** The student Review tab: reviewing your partner, and only that. Your own
 *  mistakes live on the Overview's mistakes board. The reader is a real
 *  mushaf — one full page at a time, turned RTL; the surah chips only jump
 *  to a surah's opening page. */
export async function ReviewTab({
  userId, pageParam,
}: {
  userId: string;
  pageParam?: string;
}) {
  const pair = await myActivePair(userId);

  if (!pair) {
    return (
      <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
        Your teacher hasn&apos;t paired you with anyone yet. Reviews happen with
        your revision partner.
      </p>
    );
  }

  const [range, draft, startPages, surahs] = await Promise.all([
    partnerRange(pair.partnerId),
    myDraftSession(userId, pair.partnerId),
    getCachedSurahStartPages(),
    getCachedSurahs(),
  ]);
  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );
  const firstPage = Math.max(FIRST_FONT_PAGE, Math.min(...Object.values(startPages)));

  let logging: React.ReactNode;
  if (draft && range.length > 0) {
    const current = range.find((s) => s.current) ?? range[0];
    const requested = Number(pageParam);
    const fallback = Math.max(startPages[current.number] ?? firstPage, firstPage);
    const page = Number.isInteger(requested)
      ? Math.min(Math.max(requested, firstPage), LAST_PAGE)
      : fallback;

    const [rows, mistakes] = await Promise.all([
      getCachedPageWords(page),
      draftMistakes(draft.id),
    ]);

    logging = (
      <div className="space-y-3">
        <ReviewLogger
          jump={{
            basePath: "/hifdh?tab=review",
            // Only surahs the mushaf can open: an earlier one would clamp to the
            // first page and show the wrong surah without saying so.
            options: range.filter((s) => (startPages[s.number] ?? 0) >= firstPage).map((s) => ({
              number: s.number,
              name: s.name_en,
              page: startPages[s.number] ?? firstPage,
              current: s.current,
            })),
          }}
          sessionId={draft.id}
          reciterName={pair.partnerName}
          pages={groupIntoPages(rows.map(fromRow))}
          initialMistakes={mistakes}
          surahNames={surahNames}
          // Turns in the browser; a partner's review page carries no tint.
          pager={{ page, min: firstPage, max: LAST_PAGE, basePath: "/hifdh?tab=review", live: {} }}
        />
      </div>
    );
  } else if (draft) {
    logging = (
      <p className="text-sm text-muted-foreground">
        {pair.partnerName} has no memorisation target yet. Ask your teacher.
      </p>
    );
  } else {
    logging = (
      <div className="space-y-2">
        <StartReviewButton
          reciterId={pair.partnerId}
          partnerName={pair.partnerName}
          disabled={range.length === 0}
        />
        {range.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {pair.partnerName} has no memorisation target yet.
          </p>
        )}
      </div>
    );
  }

  return (
    // Edge to edge on a phone: the mushaf inside is marked by tapping words,
    // and the panel's side margins were width taken from them.
    <section className="glass rounded-2xl p-4 space-y-3 max-md:-mx-4 max-md:rounded-none max-md:border-x-0 max-md:px-3">
      <p className="text-sm">
        Revising with <span className="font-medium">{pair.partnerName}</span>
      </p>
      {logging}
    </section>
  );
}
