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
import { ReviewFeedback } from "./review-feedback";
import { SurahJump } from "./surah-jump";

/** The seeded mushaf runs An-Nas back to Al-Mulk — pages 562–604. */
const LAST_PAGE = 604;

/** The student Review tab: review-your-partner on top, your own feedback
 *  below. The reader is a real mushaf — one full page at a time, turned
 *  RTL; the surah chips only jump to a surah's opening page. */
export async function ReviewTab({
  userId, pageParam, heatParam,
}: {
  userId: string;
  pageParam?: string;
  heatParam?: string;
}) {
  const pair = await myActivePair(userId);
  const heat = heatParam ? Number(heatParam) : undefined;

  if (!pair) {
    return (
      <div className="space-y-5">
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          Your teacher hasn&apos;t paired you with anyone yet — reviews happen with
          your revision partner.
        </p>
        <section className="space-y-2">
          <h2 className="text-lg">Your feedback</h2>
          <ReviewFeedback studentId={userId} heat={heat} basePath="/hifz?tab=review" />
        </section>
      </div>
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
  const firstPage = Math.min(...Object.values(startPages));

  let logging: React.ReactNode;
  if (draft && range.length > 0) {
    const current = range.find((s) => s.current) ?? range[0];
    const requested = Number(pageParam);
    const fallback = startPages[current.number] ?? firstPage;
    const page = Number.isInteger(requested)
      ? Math.min(Math.max(requested, firstPage), LAST_PAGE)
      : fallback;

    const [rows, mistakes] = await Promise.all([
      getCachedPageWords(page),
      draftMistakes(draft.id),
    ]);
    const heatQuery = heatParam ? `&heat=${heatParam}` : "";

    logging = (
      <div className="space-y-3">
        <SurahJump
          basePath={`/hifz?tab=review${heatQuery}`}
          options={range.map((s) => ({
            number: s.number,
            name: s.name_en,
            page: startPages[s.number] ?? firstPage,
            current: s.current,
          }))}
        />
        <ReviewLogger
          sessionId={draft.id}
          reciterName={pair.partnerName}
          pages={groupIntoPages(rows.map(fromRow))}
          initialMistakes={mistakes}
          surahNames={surahNames}
          pager={{ page, min: firstPage, max: LAST_PAGE, basePath: `/hifz?tab=review${heatQuery}` }}
        />
      </div>
    );
  } else if (draft) {
    logging = (
      <p className="text-sm text-muted-foreground">
        {pair.partnerName} has no memorisation target yet — ask your teacher.
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

  const pageQuery = pageParam ? `&page=${pageParam}` : "";
  return (
    <div className="space-y-5">
      <section className="glass rounded-2xl p-4 space-y-3">
        <p className="text-sm">
          Revising with <span className="font-medium">{pair.partnerName}</span>
        </p>
        {logging}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg">Your feedback</h2>
        <ReviewFeedback studentId={userId} heat={heat} basePath={`/hifz?tab=review${pageQuery}`} />
      </section>
    </div>
  );
}
