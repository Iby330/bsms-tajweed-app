import Link from "next/link";
import { boardFor } from "@/lib/hifz/board-queries";
import {
  ayahsToDrill, bySession, bySurah, hifdhSplit, makhrajByLetter, pickSource, tajweedByRule, who,
  type Board, type SessionColumn, type SourceFilter,
} from "@/lib/hifz/mistake-board";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import {
  getCachedPageWords, getCachedSurahStartPages, getCachedSurahWords, getCachedSurahs,
} from "@/lib/reference/cached";
import { fromRow, groupIntoPages, type QuranWordRow } from "@/lib/quran/mushaf";
import { HeatViewer } from "./heat-viewer";
import { MushafPager } from "./mushaf-pager";
import type { SurahNames } from "./mushaf-reader";
import {
  DrillCarousel, MakhrajGrid, SourceDot, SurahPicker, SurahRanks,
  type DrillCard, type LetterWord,
} from "./mistake-board-parts";
import { CAT_BG, CAT_FILL } from "./mistake-colors";
import { cn } from "@/lib/utils";

/** The seeded mushaf runs An-Nas back to Al-Mulk — pages 562–604. */
const LAST_PAGE = 604;
/** Al-Mulk's first page, and the first with a deployed QCF font. Earlier
 *  pages have words but no font and render blank, so the heatmap offers no
 *  surah that starts before it and never turns below it. */
const FIRST_FONT_PAGE = 562;
/** Below this many sessions the chart says nothing a sentence can't. */
const CHART_FROM = 3;

const SWITCH: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "teacher", label: "Teacher" },
  { id: "partner", label: "Partner" },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The mistakes board: a snapshot of how a student's Qur'an is going, from
 * every mark they have. Teacher hearings and partner revision may be shown
 * together, never without a label: the switch says whose marks are on
 * screen, and on All each session and chip still says where it came from.
 *
 * The URL owns the state that the server has to read: `src` (the switch)
 * and `heat` (a surah, or a mushaf page once the heatmap is turned).
 * `basePath` is the page the board sits on, without a query.
 */
export async function MistakeBoard({
  studentId, source, heat, basePath, run, surahHref, viewer = "student",
}: {
  studentId: string;
  /** who is looking: the student at their own board, or their teacher */
  viewer?: "student" | "teacher";
  source: SourceFilter;
  heat?: string;
  basePath: string;
  /** the student's memorisation list, run order — the heatmap's surahs */
  run: { number: number; name_en: string }[];
  /** where a surah's own page lives, opened at a mushaf page */
  surahHref: (surah: number, page?: number) => string;
}) {
  const [full, surahs, startPages] = await Promise.all([
    boardFor(studentId), getCachedSurahs(), getCachedSurahStartPages(),
  ]);
  if (!full.marks.length) {
    return <p className="box c12 note">No mistakes marked yet.</p>;
  }

  const board: Board = pickSource(full, source);
  const nameOf = new Map(surahs.map((s) => [s.number, s.name_en]));
  const href = (q: { src?: SourceFilter; heat?: string | number }, hash = "") => {
    const params = new URLSearchParams();
    const src = q.src ?? source;
    if (src !== "all") params.set("src", src);
    if (q.heat !== undefined && q.heat !== "") params.set("heat", String(q.heat));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}${hash}`;
  };

  const header = (
    <div className="box c12">
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="label">Mistakes</span>
        <span className="note">
          {plural(board.marks.length, "mark")} · {plural(board.sessions.length, "session")}
          {source === "all" && `: ${plural(full.sessions.filter((s) => s.source === "teacher").length, "teacher hearing")}, ${plural(full.sessions.filter((s) => s.source === "partner").length, "partner revision")}`}
        </span>
      </div>
      <nav aria-label="Whose marks" className="inline-flex rounded-lg border border-line p-0.5">
        {SWITCH.map((s) => (
          <Link
            key={s.id}
            href={href({ src: s.id, heat: heat })}
            scroll={false}
            aria-current={source === s.id ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-xs transition-colors",
              source === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
     </div>
    </div>
  );

  if (!board.marks.length) {
    return (
      <>
        {header}
        <p className="box c12 note">
          {source === "teacher" ? "No teacher marks yet." : "No partner marks yet."}
        </p>
      </>
    );
  }

  const hifdh = hifdhSplit(board.marks);
  const tajweed = tajweedByRule(board.marks);
  const makhraj = makhrajByLetter(board.marks);
  const columns = bySession(board);
  const ranks = bySurah(board.marks);
  const drill = ayahsToDrill(board.marks);

  // Words for the drill cards and the letter dialog, one cached read per surah.
  const wanted = new Set([...drill.map((a) => a.surah), ...board.marks.filter((m) => m.category === "makhraj").map((m) => m.surah_number)]);
  const wordRows = new Map<number, QuranWordRow[]>(
    await Promise.all([...wanted].map(async (s) => [s, await getCachedSurahWords(s)] as const)),
  );
  const ayahWords = (surah: number, ayah: number) =>
    (wordRows.get(surah) ?? []).filter((w) => w.ayah_number === ayah && !w.is_end);
  const pageOf = (surah: number, ayah: number) => ayahWords(surah, ayah)[0]?.page_number;

  const cards: DrillCard[] = drill.map((a) => {
    const sessionsAt = new Map(board.sessions.map((s) => [s.id, s]));
    return {
      key: `${a.surah}:${a.ayah}`,
      surahName: nameOf.get(a.surah) ?? `Surah ${a.surah}`,
      surah: a.surah,
      ayah: a.ayah,
      words: ayahWords(a.surah, a.ayah).map((w) => ({
        position: w.word_position, text: w.text_uthmani, category: a.words[w.word_position] ?? null,
      })),
      wholeAyah: a.wholeAyah,
      chips: a.chips.map((c) => ({
        label: c.label, category: c.category, count: c.teacher + c.partner, who: who(c.teacher, c.partner),
      })),
      sessions: a.sessionIds
        .map((id) => sessionsAt.get(id)!)
        .filter(Boolean)
        .sort((x, y) => x.at.localeCompare(y.at))
        .map((s) => s.source),
      href: surahHref(a.surah, pageOf(a.surah, a.ayah)),
    };
  });

  const letterWords: Record<string, LetterWord[]> = {};
  for (const m of board.marks) {
    if (m.category !== "makhraj" || !m.detail) continue;
    const w = ayahWords(m.surah_number, m.ayah_number).find((x) => x.word_position === m.word_position);
    (letterWords[m.detail] ??= []).push({
      label: `${nameOf.get(m.surah_number) ?? m.surah_number} ${m.surah_number}:${m.ayah_number}`,
      text: w?.text_uthmani ?? "",
      source: m.source,
      href: surahHref(m.surah_number, pageOf(m.surah_number, m.ayah_number)),
    });
  }

  // The heatmap: `heat` names a surah (open at its first page) or a page.
  const onRun = run.filter((s) => (startPages[s.number] ?? 0) >= FIRST_FONT_PAGE);
  const counts = new Map(ranks.map((r) => [r.surah, r.count]));
  const heatNum = heat ? Number(heat) : NaN;
  const firstPage = Math.min(...onRun.map((s) => startPages[s.number]));
  const heatPage = !Number.isInteger(heatNum) ? null
    : startPages[heatNum] !== undefined && heatNum <= 114 ? startPages[heatNum]
      : heatNum >= firstPage && heatNum <= LAST_PAGE ? heatNum : null;
  const heatSurah = heatPage === null ? null
    : startPages[heatNum] !== undefined && heatNum <= 114 ? heatNum
      : onRun.find((s) => startPages[s.number] <= heatPage)?.number ?? null;

  let mushaf: React.ReactNode = null;
  if (heatPage !== null) {
    const rows = await getCachedPageWords(heatPage);
    const words = rows.map(fromRow);
    const { heat: tint, history } = spreadHeat(words, board.marks, new Date());
    const surahNames: SurahNames = Object.fromEntries(surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));
    mushaf = (
      <MushafPager page={heatPage} min={firstPage} max={LAST_PAGE} basePath={href({ heat: "" })} param="heat">
        <HeatViewer pages={groupIntoPages(words)} heat={tint} history={history} surahNames={surahNames} />
      </MushafPager>
    );
  }

  return (
    <>
      {header}

      <section className="box c12" aria-label="Hifdh mistakes by kind">
        <CardHead title="Hifdh" count={`${hifdh.total} of ${board.marks.length}`} aside="what kind of slip" />
        {hifdh.total ? (
          <>
            <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-[4px]" role="img"
              aria-label={hifdh.slices.map((s) => `${s.label} ${s.count}`).join(", ")}>
              {hifdh.slices.map((s, i) => (
                <span key={s.label} className="bg-cat-hifdh" title={`${s.label}: ${s.count}`}
                  style={{ width: `${(s.count / hifdh.total) * 100}%`, opacity: [1, 0.6, 0.3, 0.18][i] ?? 0.18 }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {hifdh.slices.map((s, i) => (
                <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                  <span aria-hidden className="size-2 rounded-full bg-cat-hifdh" style={{ opacity: [1, 0.6, 0.3, 0.18][i] ?? 0.18 }} />
                  {s.label} <span className="tabular-nums text-ink-3">{s.count}</span>
                </span>
              ))}
            </div>
          </>
        ) : <p className="note">No hifdh slips marked.</p>}
      </section>

      <section className="box c6" aria-label="Tajweed mistakes by rule">
        <CardHead title="Tajweed" count={String(tajweed.total)} aside="by rule" />
        <div className="flex flex-col gap-2">
          {tajweed.rules.map((r) => (
            <div key={r.label} className="grid grid-cols-[6.5rem_1fr_1.5rem] items-center gap-2.5 text-sm">
              <span className={cn(!r.count && "text-ink-3")}>{r.label}</span>
              {r.count
                ? <span className="h-2.5 rounded-r-[4px] bg-cat-tajweed" style={{ width: `${(r.count / Math.max(...tajweed.rules.map((x) => x.count))) * 100}%` }} />
                : <span />}
              <span className={cn("text-right text-xs tabular-nums", r.count ? "text-ink-2" : "text-ink-3")}>{r.count || "–"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="box c6" aria-label="Makhraj mistakes by letter">
        <CardHead title="Makhraj" count={String(makhraj.total)} aside="by letter" />
        <MakhrajGrid letters={makhraj.letters} counts={makhraj.counts} words={letterWords} />
        <p className="note">{makhraj.total ? "Tap a letter to see the words." : "No makhraj mistakes marked."}</p>
      </section>

      <section className="box c6" aria-label="Mistakes session by session">
        <CardHead title="Session by session" aside={`last ${columns.length}`} />
        {columns.length >= CHART_FROM
          ? <SessionChart columns={columns} />
          : <p className="note">{plural(columns.length, "session")} so far. The chart starts at {CHART_FROM}.</p>}
      </section>

      <section className="box c6" aria-label="Surahs with the most mistakes">
        <CardHead title="Surahs, most mistakes" aside={plural(ranks.length, "surah")} />
        <SurahRanks ranks={ranks.map((r) => ({
          surah: r.surah, name: nameOf.get(r.surah) ?? String(r.surah), count: r.count,
          href: href({ heat: r.surah }, "#heatmap"),
        }))} />
      </section>

      <section className="box c12" aria-label="Ayahs to drill">
        <DrillCarousel cards={cards} />
      </section>

      <section id="heatmap" className="box c12 scroll-mt-24" aria-label="Mushaf heatmap">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="label">Mushaf heatmap</span>
            <span className="note">
              {onRun.length
                ? `Any surah on ${viewer === "teacher" ? "their" : "your"} run, page by page. Tap a surah above to open it too.`
                : "The mushaf here runs from An-Nas to Al-Mulk for now."}
            </span>
          </div>
          {onRun.length > 0 && <div className="flex items-center gap-2">
            <SurahPicker
              // keyed on the open surah, so turning pages into the next surah
              // (or tapping one in the list) moves the choice with it
              key={heatSurah ?? "closed"}
              options={onRun.map((s) => ({ surah: s.number, name: s.name_en, count: counts.get(s.number) ?? 0 }))}
              selected={heatSurah ?? ranks[0]?.surah ?? null}
              hrefFor={Object.fromEntries(onRun.map((s) => [s.number, href({ heat: s.number }, "#heatmap")]))}
              open={mushaf !== null}
              closeHref={href({ heat: "" }, "#heatmap")}
            />
          </div>}
        </div>
        {mushaf}
      </section>
    </>
  );
}

function CardHead({ title, count, aside }: { title: string; count?: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-medium">
        {title}{count !== undefined && <span className="font-normal text-ink-3"> · {count}</span>}
      </h3>
      {aside && <span className="text-xs text-ink-3">{aside}</span>}
    </div>
  );
}

/** Stacked columns, one per session, oldest first: hifdh at the base, then
 *  tajweed, then makhraj, a 2px gap between. A filled dot under a teacher
 *  hearing, a ring under partner revision. Each column's title is its tooltip. */
function SessionChart({ columns }: { columns: SessionColumn[] }) {
  const W = 340, BASE = 136, TOP = 14, X0 = 20;
  const max = Math.max(4, ...columns.map((c) => c.total));
  const top = Math.ceil(max / 4) * 4;
  const unit = (BASE - TOP) / top;
  const step = (W - X0) / columns.length;
  const bw = Math.min(16, step * 0.55);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${BASE + 34}`} className="block w-full" role="img"
        aria-label={`Mistakes in the last ${columns.length} sessions`}>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={X0} x2={W} y1={BASE - v * unit} y2={BASE - v * unit} className="stroke-line" strokeWidth={1} />
            <text x={X0 - 6} y={BASE - v * unit + 3.5} fontSize={10} textAnchor="end" className="fill-ink-3">{v}</text>
          </g>
        ))}
        {columns.map((c, i) => {
          const x = X0 + step * i + (step - bw) / 2;
          const segs = ([["hifz", c.hifz], ["tajweed", c.tajweed], ["makhraj", c.makhraj]] as const).filter(([, n]) => n > 0);
          let y = BASE;
          return (
            <g key={c.id}>
              <title>
                {`${day(c.at)} · ${c.source === "teacher" ? "teacher hearing" : "partner revision"} · ${
                  c.total ? [c.hifz && `${c.hifz} hifdh`, c.tajweed && `${c.tajweed} tajweed`, c.makhraj && `${c.makhraj} makhraj`].filter(Boolean).join(", ") : "clean"}`}
              </title>
              <rect x={x - 3} y={TOP} width={bw + 6} height={BASE - TOP + 16} fill="transparent" />
              {c.total === 0 && <rect x={x} y={BASE - 2} width={bw} height={2} rx={1} className="fill-ink-3" />}
              {segs.map(([cat, n], j) => {
                const h = n * unit - (j ? 2 : 0);
                y -= n * unit;
                const isTop = j === segs.length - 1;
                const r = Math.min(3, h / 2);
                const yTop = y;
                const yBottom = yTop + h;
                const d = isTop
                  ? `M${x} ${yBottom} V${yTop + r} a${r} ${r} 0 0 1 ${r} -${r} H${x + bw - r} a${r} ${r} 0 0 1 ${r} ${r} V${yBottom} Z`
                  : `M${x} ${yBottom} V${yTop} H${x + bw} V${yBottom} Z`;
                return <path key={cat} d={d} className={CAT_FILL[cat]} />;
              })}
              <circle cx={x + bw / 2} cy={BASE + 10} r={c.source === "teacher" ? 3.5 : 3}
                className={c.source === "teacher" ? "fill-foreground" : "fill-none stroke-foreground"} strokeWidth={1.5} />
              {(i === 0 || i === columns.length - 1) && (
                <text x={x + bw / 2} y={BASE + 28} fontSize={10} className="fill-ink-3"
                  textAnchor={i === 0 ? "start" : "end"} dx={i === 0 ? -4 : 4}>{day(c.at)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-2">
        {(["hifz", "tajweed", "makhraj"] as const).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", CAT_BG[c])} />
            {c === "hifz" ? "Hifdh" : c === "tajweed" ? "Tajweed" : "Makhraj"}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><SourceDot source="teacher" />Teacher hearing</span>
        <span className="inline-flex items-center gap-1.5"><SourceDot source="partner" />Partner revision</span>
      </div>
    </div>
  );
}
