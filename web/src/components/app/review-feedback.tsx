import Link from "next/link";
import { feedbackFor } from "@/lib/hifz/review-queries";
import {
  aggregateFlags, aggregatePatterns, heatClass, wordHeat,
} from "@/lib/hifz/mistakes";
import { detailLabel } from "@/lib/hifz/mistake-taxonomy";
import { getCachedSurahs, getCachedSurahWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages, wordKey } from "@/lib/quran/mushaf";
import { PatternTracker } from "./pattern-tracker";
import { HeatViewer, type WordHistoryEntry } from "./heat-viewer";
import { cn } from "@/lib/utils";

/**
 * Submitted-review results for one student: pattern tracker, per-surah
 * heatmap, session history. RLS behind feedbackFor decides who may look.
 * basePath already carries ?tab=review — heat links append &heat=N.
 */
export async function ReviewFeedback({
  studentId, heatSurah, basePath,
}: {
  studentId: string;
  heatSurah?: number;
  basePath: string;
}) {
  const [{ sessions, mistakes }, surahs] = await Promise.all([
    feedbackFor(studentId),
    getCachedSurahs(),
  ]);
  if (!sessions.length) {
    return (
      <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
        No submitted reviews yet.
      </p>
    );
  }

  const now = new Date();
  const patterns = aggregatePatterns(mistakes, now);
  const flags = aggregateFlags(sessions);

  const counts = new Map<number, number>();
  for (const m of mistakes) counts.set(m.surah_number, (counts.get(m.surah_number) ?? 0) + 1);
  const heatSurahs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const active = heatSurah && counts.has(heatSurah) ? heatSurah : heatSurahs[0];
  const nameOf = new Map(surahs.map((s) => [s.number, s.name_en]));

  let heatBlock: React.ReactNode = null;
  if (active) {
    const rows = await getCachedSurahWords(active);
    const pages = groupIntoPages(rows.map(fromRow));
    const inSurah = mistakes.filter((m) => m.surah_number === active);
    const heat = Object.fromEntries(
      Object.entries(wordHeat(inSurah, now)).map(([k, v]) => [k, heatClass(v)]),
    );
    const history: Record<string, WordHistoryEntry[]> = {};
    for (const m of [...inSurah].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const k = wordKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
      (history[k] ??= []).push({
        label: detailLabel(m.category, m.detail), note: m.note, date: m.created_at,
      });
    }
    heatBlock = (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Mistake heatmap</h3>
        <div className="flex flex-wrap gap-1.5">
          {heatSurahs.map((n) => (
            <Link key={n} href={`${basePath}&heat=${n}`}
              className={cn(
                "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                n === active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}>
              {nameOf.get(n) ?? n} · {counts.get(n)}
            </Link>
          ))}
        </div>
        <HeatViewer pages={pages} heat={heat} history={history} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PatternTracker patterns={patterns} flags={flags} />
      {heatBlock}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Review sessions</h3>
        <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
          {sessions.map((s) => {
            const n = mistakes.filter((m) => m.session_id === s.id).length;
            return (
              <li key={s.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {new Date(s.submitted_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    <span className="ml-2 text-xs text-muted-foreground">by {s.reviewerName}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {n} mistake{n === 1 ? "" : "s"}
                  </span>
                </div>
                {s.overall_note && (
                  <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2">
                    {s.overall_note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
