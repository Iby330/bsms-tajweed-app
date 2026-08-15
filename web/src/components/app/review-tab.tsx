import Link from "next/link";
import {
  draftMistakes, myActivePair, myDraftSession, partnerRange,
} from "@/lib/hifz/review-queries";
import { getCachedSurahWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { ReviewLogger } from "./review-logger";
import { StartReviewButton } from "./start-review-button";
import { ReviewFeedback } from "./review-feedback";
import { cn } from "@/lib/utils";

/** The student Review tab: review-your-partner on top, your own feedback
 *  below. Everything hangs off the teacher-assigned active pair. */
export async function ReviewTab({
  userId, surahParam, heatParam,
}: {
  userId: string;
  surahParam?: string;
  heatParam?: string;
}) {
  const pair = await myActivePair(userId);
  const heatSurah = heatParam ? Number(heatParam) : undefined;

  if (!pair) {
    return (
      <div className="space-y-5">
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          Your teacher hasn&apos;t paired you with anyone yet — reviews happen with
          your revision partner.
        </p>
        <section className="space-y-2">
          <h2 className="text-lg">Your feedback</h2>
          <ReviewFeedback studentId={userId} heatSurah={heatSurah} basePath="/hifz?tab=review" />
        </section>
      </div>
    );
  }

  const [range, draft] = await Promise.all([
    partnerRange(pair.partnerId),
    myDraftSession(userId, pair.partnerId),
  ]);

  let logging: React.ReactNode;
  if (draft) {
    const requested = Number(surahParam);
    const surah =
      (range.some((s) => s.number === requested) ? requested : null) ??
      (range.find((s) => s.current) ?? range[0])?.number;
    if (!surah) {
      logging = (
        <p className="text-sm text-muted-foreground">
          {pair.partnerName} has no memorisation target yet — ask your teacher.
        </p>
      );
    } else {
      const [rows, mistakes] = await Promise.all([
        getCachedSurahWords(surah),
        draftMistakes(draft.id),
      ]);
      logging = (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {range.map((s) => (
              <Link key={s.number} href={`/hifz?tab=review&surah=${s.number}`}
                className={cn(
                  "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                  s.number === surah ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}>
                {s.name_en}{s.current ? " · current" : ""}
              </Link>
            ))}
          </div>
          <ReviewLogger
            sessionId={draft.id}
            reciterName={pair.partnerName}
            pages={groupIntoPages(rows.map(fromRow))}
            initialMistakes={mistakes.filter((m) => m.surah_number === surah)}
          />
        </div>
      );
    }
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
    <div className="space-y-5">
      <section className="glass rounded-2xl p-4 space-y-3">
        <p className="text-sm">
          Revising with <span className="font-medium">{pair.partnerName}</span>
        </p>
        {logging}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg">Your feedback</h2>
        <ReviewFeedback studentId={userId} heatSurah={heatSurah} basePath="/hifz?tab=review" />
      </section>
    </div>
  );
}
