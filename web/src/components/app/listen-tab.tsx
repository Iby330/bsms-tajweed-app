import Link from "next/link";
import { draftMistakes, myOpenListens, classmatesOf } from "@/lib/hifz/review-queries";
import {
  getCachedPageWords, getCachedSurahs, getCachedSurahStartPages,
} from "@/lib/reference/cached";
import { firstReadablePage, fullMushafSurahs } from "@/lib/hifz/mushaf-reach";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";
import type { SurahNames } from "./mushaf-reader";
import { ReviewLogger } from "./review-logger";
import { StartReviewButton } from "./start-review-button";
import { SurahJump } from "./surah-jump";

const LAST_PAGE = 604;
const FIRST_PAGE = firstReadablePage("ustadhs");

/**
 * The ustadhs' Review tab. They have no fixed partners: they recite round the
 * room in whatever order suits, so whoever is listening picks who is reciting,
 * each time, from anywhere in the mushaf.
 */
export async function ListenTab({
  userId, classId, listenParam, pageParam,
}: {
  userId: string;
  classId: string | null;
  listenParam?: string;
  pageParam?: string;
}) {
  const [people, open] = await Promise.all([classmatesOf(userId, classId), myOpenListens(userId)]);
  const selected = people.find((p) => p.id === listenParam) ?? null;
  const draftId = selected ? open.get(selected.id) ?? null : null;

  const picker = (
    <nav aria-label="Who are you listening to?" className="flex flex-wrap gap-2">
      {people.map((p) => (
        <Link
          key={p.id}
          href={`/hifdh?tab=review&listen=${p.id}`}
          scroll={false}
          aria-current={p.id === selected?.id ? "true" : undefined}
          className={cn(
            "rounded-md border border-line px-3 py-1.5 text-sm transition-colors",
            p.id === selected?.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.name}
          {open.has(p.id) && <span className="ml-1.5 text-xs opacity-75">· in progress</span>}
        </Link>
      ))}
    </nav>
  );

  let logging: React.ReactNode = null;
  if (selected && draftId) {
    const [startPages, surahs] = await Promise.all([getCachedSurahStartPages(), getCachedSurahs()]);
    const all = fullMushafSurahs(surahs);
    const requested = Number(pageParam);
    const page = pageParam && Number.isInteger(requested)
      ? Math.min(Math.max(requested, FIRST_PAGE), LAST_PAGE)
      : FIRST_PAGE;
    const [rows, mistakes] = await Promise.all([getCachedPageWords(page), draftMistakes(draftId)]);
    const surahNames: SurahNames = Object.fromEntries(
      all.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
    );
    const basePath = `/hifdh?tab=review&listen=${selected.id}`;
    logging = (
      <div className="space-y-3">
        <SurahJump
          basePath={basePath}
          options={all
            .filter((s) => startPages[s.number] !== undefined)
            .map((s) => ({ number: s.number, name: `${s.number}. ${s.name_en}`, page: startPages[s.number] }))}
        />
        <ReviewLogger
          sessionId={draftId}
          reciterName={selected.name}
          pages={groupIntoPages(rows.map(fromRow))}
          initialMistakes={mistakes}
          surahNames={surahNames}
          pager={{ page, min: FIRST_PAGE, max: LAST_PAGE, basePath }}
        />
      </div>
    );
  } else if (selected) {
    logging = (
      <StartReviewButton
        reciterId={selected.id}
        partnerName={selected.name}
        label={`Start listening to ${selected.name}`}
      />
    );
  }

  return (
    <section className="glass rounded-2xl p-4 space-y-3 max-md:-mx-4 max-md:rounded-none max-md:border-x-0 max-md:px-3">
      <p className="text-sm">Who are you listening to?</p>
      {people.length ? picker : <p className="text-sm text-muted-foreground">No one else is in your class yet.</p>}
      {logging}
    </section>
  );
}
