import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/format";
import { hizbOf, rowPlan } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import type { Surah } from "@/lib/hifz/pace";

type Rec = { passed_at: string; teacher_comment: string | null };

/** Gentle winding: node indent cycles per row. CSS only, no animation. */
const OFFSETS = [0, 16, 32, 16];

/**
 * The path itself. Shows the student's own list, grouped by hizb, with a
 * "you are here" node, a dashed marker where class pace sits, collapsed
 * upcoming stretches, and hizb-check milestone cards between groups.
 * Comments live in <HifzRecord>; nodes only get a hint glyph.
 */
export function HifzJourney({
  list,
  records,
  expected,
}: {
  list: Surah[];
  records: Map<number, Rec>;
  expected: number;
}) {
  const passedCount = list.filter((s) => records.has(s.number)).length;
  const currentIdx = list.findIndex((s) => !records.has(s.number)); // -1 → all passed
  const markerIdx =
    expected > 0 && expected !== passedCount ? Math.min(expected, list.length) - 1 : null;

  // Contiguous hizb groups over the list, keeping each surah's global index.
  const groups: { hizb: number | null; start: number; surahs: Surah[] }[] = [];
  list.forEach((s, i) => {
    const h = hizbOf(s.number);
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.surahs.push(s);
    else groups.push({ hizb: h, start: i, surahs: [s] });
  });

  const groupState = (g: (typeof groups)[number]) => {
    const passed = g.surahs.filter((s) => records.has(s.number)).length;
    if (passed === g.surahs.length) return "complete";
    if (currentIdx >= g.start && currentIdx < g.start + g.surahs.length) return "current";
    return "future";
  };

  return (
    <section aria-label="Memorisation journey" className="rounded-lg border border-line bg-card p-5">
      {groups.map((g, gi) => {
        const state = groupState(g);
        const next = groups[gi + 1];
        const nextStarted = next ? next.surahs.some((s) => records.has(s.number)) : false;
        const first = g.surahs[0];
        const last = g.surahs[g.surahs.length - 1];
        const markerInGroup =
          markerIdx !== null && markerIdx >= g.start && markerIdx < g.start + g.surahs.length;

        // Future groups collapse to a label row — but never swallow the pace marker.
        if (state === "future") {
          return (
            <div key={gi} className="mt-3 border-t border-line pt-3 first:mt-0 first:border-t-0 first:pt-0">
              <p className="text-xs text-muted-foreground">
                Hizb {g.hizb} — {first.name_en} to {last.name_en} · {g.surahs.length} surahs
              </p>
              {markerInGroup && (
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="size-7 shrink-0 rounded-full border-2 border-dashed border-warn" />
                  <span className="text-xs text-warn">
                    class pace is ahead — {list[markerIdx!].name_en}
                  </span>
                </div>
              )}
            </div>
          );
        }

        // Which rows stay visible: everything except upcoming nodes, but keep
        // the first upcoming, the group's last node, and the pace-marker node.
        const keep = new Set<number>();
        g.surahs.forEach((s, li) => {
          const i = g.start + li;
          const upcoming = !records.has(s.number) && i !== currentIdx;
          if (!upcoming || i === currentIdx + 1 || li === g.surahs.length - 1 || i === markerIdx)
            keep.add(li);
        });

        return (
          <div key={gi} className={cn(gi > 0 && "mt-4")}>
            <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Hizb {g.hizb} — {first.name_en} to {last.name_en}
            </p>

            {rowPlan(g.surahs.length, keep).map((row, ri) => {
              if (row.kind === "gap") {
                return (
                  <div key={`gap-${ri}`} className="my-1 ml-9 text-xs text-muted-foreground">
                    … {row.count} more surahs
                  </div>
                );
              }
              const li = row.index;
              const i = g.start + li;
              const s = g.surahs[li];
              const rec = records.get(s.number);
              const offset = OFFSETS[li % OFFSETS.length];
              const isCurrent = i === currentIdx;
              const nodeMeta = SURAH_META[s.number];

              return (
                <div key={s.number}>
                  {li > 0 && (
                    <div
                      className={cn("h-3 w-0.5", rec ? "bg-ok" : "bg-line")}
                      style={{ marginLeft: offset + 13 }}
                    />
                  )}
                  {isCurrent ? (
                    <div className="flex items-center gap-3" style={{ marginLeft: offset }}>
                      <div className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-ok bg-card shadow-sm">
                        <span dir="rtl" lang="ar" className="ar-ui text-xs text-ok">
                          {s.name_ar}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.name_en} — you are here</p>
                        {nodeMeta && (
                          <p className="text-xs text-muted-foreground">
                            {nodeMeta.ayahs} ayahs · &ldquo;{nodeMeta.meaning}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn("flex items-center gap-2.5", !rec && "opacity-50")}
                      style={{ marginLeft: offset }}
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full text-[11px]",
                          rec ? "bg-ok text-white" : "border border-line text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {rec ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate text-sm text-muted-foreground">
                        {s.name_en}{" "}
                        <span dir="rtl" lang="ar" className="ar-ui">
                          {s.name_ar}
                        </span>
                        {rec?.teacher_comment && (
                          <span aria-label="has teacher comment" className="ml-1 text-xs">
                            💬
                          </span>
                        )}
                      </span>
                      {rec && (
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                          {fmtDay(rec.passed_at)}
                        </span>
                      )}
                    </div>
                  )}
                  {i === markerIdx && (
                    <>
                      <div className="h-3 w-0.5 bg-line" style={{ marginLeft: offset + 13 }} />
                      <div className="flex items-center gap-2.5" style={{ marginLeft: offset }}>
                        <span className="size-7 shrink-0 rounded-full border-2 border-dashed border-warn" />
                        <span className="text-xs text-warn">class pace is here — {s.name_en}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Hizb-check milestone after this group (not after the final group). */}
            {next && g.hizb !== null && (
              <div
                className={cn(
                  "mt-3 flex items-center gap-3 rounded-lg border px-4 py-3",
                  state === "complete" && !nextStarted && "border-warn bg-warn/10",
                  state === "complete" && nextStarted && "border-line bg-muted/50",
                  state === "current" && "border-dashed border-warn/50 bg-warn/5",
                )}
              >
                <span
                  aria-hidden
                  className={cn("text-base", state === "complete" && nextStarted ? "text-ok" : "text-warn")}
                >
                  {state === "complete" && nextStarted ? "✓" : "◆"}
                </span>
                <div>
                  <p className={cn("text-xs font-medium", state === "current" ? "text-warn" : "text-foreground")}>
                    {state === "complete" && !nextStarted
                      ? `Ready for your Hizb ${g.hizb} check`
                      : `Hizb ${g.hizb} check`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Present the whole hizb to your teacher in one sitting
                    {next.hizb !== null && ` — then Hizb ${next.hizb} begins`}.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Completion milestone at the end of the student's own list. */}
      {currentIdx === -1 && list.length > 0 && (
        <div className="mt-3 rounded-lg border border-ok bg-ok/10 px-4 py-3 text-center">
          <p className="text-sm font-medium text-ok">Target complete — masha&rsquo;Allah.</p>
        </div>
      )}
    </section>
  );
}
