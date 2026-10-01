"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader, type SurahNames } from "./mushaf-reader";
import { MushafPager } from "./mushaf-pager";
import { MistakeSheet, type SheetResult } from "./mistake-sheet";
import { HearingFinish, type Verdict } from "./hearing-finish";
import { HearingStart, type PlannedRange } from "./hearing-start";
import { WordHistoryDialog } from "./heat-viewer";
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { submitHearing, type StartedHearing } from "@/lib/hifz/hearing-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import { endSurahFor } from "@/lib/hifz/hearings";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import { markKey, wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

type Mark = { id?: string; category: Category; detail: string | null; note: string | null };

/** The tapped token's target: an ayah end marker classifies the whole ayah,
 *  anything else the single word. */
const targetOf = (w: QuranWord) => ({
  surah: w.surah, ayah: w.ayah, position: w.isEnd ? null : w.position,
});

/**
 * The live logging island: tap a word → classify → it tints. Tapping an
 * ayah's END MARKER classifies the whole ayah instead, which is the commoner
 * slip — one row, tinting every word in it. State is local (each tap is one
 * server action, no refresh); submit refreshes the page so the server swaps
 * this for whatever comes after.
 *
 * Two modes, one logger:
 *  · `peer` — a partner listening. "Listening to B · Finish" on top; Finish
 *    asks for flags and a note. The session always exists.
 *  · `hearing` — the teacher, on the Thursday lesson. Before a hearing the
 *    bar offers Start hearing and the mushaf only looks: a tap on a word
 *    earlier hearings marked shows what they said, and nothing is logged or
 *    created. Start opens a popup for the range (From, To) and creates the
 *    draft with it. During the hearing taps mark, and End hearing opens the
 *    range popup at the planned end, widened to cover any mark beyond it;
 *    Confirm signs off the ticked surahs and the bar goes back to Start
 *    hearing. A `sessionId` passed in is a hearing already open (a reload,
 *    or one left from before), so the logger starts mid-hearing.
 *    `heat`/`history` paint what earlier hearings said about the same
 *    words.
 */
export function ReviewLogger({
  mode = "peer",
  sessionId,
  reciterName,
  pages,
  initialMistakes,
  heat,
  history,
  surahNames,
  pager,
  hearing,
}: {
  mode?: "peer" | "hearing";
  /** Peer mode: always set. Hearing mode: the open draft, or null before Start. */
  sessionId: string | null;
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];   // the whole session — marks span pages
  heat?: Record<string, string>;                  // earlier hearings' tint
  history?: Record<string, WordHistoryEntry[]>;   // …and what they said
  surahNames?: SurahNames;
  pager?: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
  /** Hearing mode only. `from` is the open draft's start, or the Start
   *  popup's default From; `plannedTo` is the open draft's planned end. */
  hearing?: {
    from: number;
    plannedTo?: number;
    minEnd: number;                                 // the run's last surah
    run: { number: number; name: string }[];        // the Start popup's choices
    names: SurahNames;
    passedBefore: Record<number, string>;
    start: (range: PlannedRange) => Promise<StartedHearing>;
    onStarted?: (started: StartedHearing) => void;
    onFinished?: (sessionId: string) => void;
  };
}) {
  const router = useRouter();
  const [sid, setSid] = useState<string | null>(sessionId);
  // The hearing's planned range while one is open; null before Start.
  const [range, setRange] = useState<PlannedRange | null>(() =>
    hearing && sessionId ? { from: hearing.from, to: hearing.plannedTo ?? hearing.from } : null,
  );
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      initialMistakes.map((m) => [
        markKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position }),
        { id: m.id, category: m.category, detail: m.detail, note: m.note },
      ]),
    ),
  );
  const [tapped, setTapped] = useState<QuranWord | null>(null);
  const [looked, setLooked] = useState<{ word: QuranWord; entries: WordHistoryEntry[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [wrapUp, setWrapUp] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [overallNote, setOverallNote] = useState("");
  const [pending, startTransition] = useTransition();

  // Before Start a hearing only looks: no sheet, no draft, nothing logged.
  const looking = mode === "hearing" && !sid;

  /**
   * The session to write to. Writes fire in the SAME synchronous tick as
   * the click that triggered them — no `await` sneaks in a microtask before
   * the write, which matters because peer mode's tests assert the mock was
   * called immediately after `fireEvent.click`. Nothing reaches here
   * without a session: a hearing's marking sheet opens only once it has
   * started, and its Finish only shows then.
   */
  const withSession = (write: (id: string) => Promise<void>) =>
    sid ? write(sid) : Promise.reject(new Error("This session is closed. Reload the page."));

  const onWordTap = (word: QuranWord) => {
    if (!looking) return setTapped(word);
    const entries = history?.[wordKey(word)];
    if (entries?.length) setLooked({ word, entries });
  };

  const begin = (r: PlannedRange) =>
    startTransition(async () => {
      if (!hearing) return;
      const started = await hearing.start(r);
      // An already-open draft comes back with its own range, which wins.
      setSid(started.id);
      setRange({ from: started.from, to: started.to });
      setStarting(false);
      if (hearing.onStarted) hearing.onStarted(started);
      else router.refresh();
    });

  const save = (r: SheetResult) => {
    const word = tapped;
    if (!word) return;
    setTapped(null);
    const target = targetOf(word);
    startTransition(() =>
      withSession(async (id) => {
        const newId = await logMistake(id, target, r.category, r.detail ?? undefined, r.note);
        setMarks((m) => ({
          ...m,
          [markKey(target)]: { id: newId, category: r.category, detail: r.detail, note: r.note },
        }));
      }),
    );
  };

  const remove = () => {
    const word = tapped;
    if (!word) return;
    const key = markKey(targetOf(word));
    const mark = marks[key];
    setTapped(null);
    if (!mark?.id) return;
    startTransition(async () => {
      await removeMistake(mark.id!);
      setMarks((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
    });
  };

  const submit = () =>
    startTransition(() =>
      withSession(async (id) => {
        await submitSession(id, flags, overallNote);
        setWrapUp(false);
        router.refresh();
      }),
    );

  const count = Object.keys(marks).length;
  const plural = count === 1 ? "mistake" : "mistakes";
  const existing = tapped ? marks[markKey(targetOf(tapped))] : undefined;
  // spreadHeat keys history by wordKey for every word, end markers included.
  const previous = tapped ? history?.[wordKey(tapped)] : undefined;

  const reader = (
    <MushafReader pages={pages} marks={marks} heat={heat} surahNames={surahNames} onWordTap={onWordTap} />
  );

  // markKey is "surah:ayah" or "surah:ayah:position": the surah is always first.
  const markSurahs = Object.keys(marks).map((k) => Number(k.split(":")[0]));
  const initialEnd = range ? endSurahFor(range.from, range.to, markSurahs) : 0;
  const finishHearing = (v: Verdict) =>
    startTransition(() =>
      withSession(async (id) => {
        await submitHearing(id, v);
        setWrapUp(false);
        // The hearing is closed: back to before a hearing, so a tap looks
        // rather than writing into it, and its marks are no longer live.
        setSid(null);
        setRange(null);
        setMarks({});
        router.refresh();
        hearing?.onFinished?.(id);
      }),
    );

  const name = (n: number) => hearing?.names[n]?.en ?? String(n);
  const span = range
    ? range.to === range.from ? name(range.from) : `${name(range.from)} → ${name(range.to)}`
    : null;

  return (
    <div className="space-y-3">
      <div className="glass sticky top-[calc(var(--chrome-top,0px)+0.5rem)] z-10 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5">
        {mode === "hearing" ? (
          <p className="min-w-0 text-sm">
            <span className="font-medium">{reciterName}</span>
            {span && <span className="ml-2">{span}</span>}
            {range && (
              <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                {count} {plural}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm">
            Listening to <span className="font-medium">{reciterName}</span>
            <span className="ml-2 text-xs tabular-nums text-muted-foreground">
              {count} {plural}
            </span>
          </p>
        )}
        {looking ? (
          <Button size="sm" disabled={pending} onClick={() => setStarting(true)}>Start hearing</Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>
            {mode === "hearing" ? "End hearing" : "Finish"}
          </Button>
        )}
      </div>

      {pager ? <MushafPager {...pager}>{reader}</MushafPager> : reader}

      <WordHistoryDialog open={looked} onClose={() => setLooked(null)} />

      <MistakeSheet
        key={tapped ? markKey(targetOf(tapped)) : "closed"}
        word={tapped}
        existing={existing}
        previous={previous}
        onSave={save}
        onRemove={existing ? remove : undefined}
        onClose={() => setTapped(null)}
      />

      {mode === "hearing" && hearing && (
        <HearingStart
          open={starting}
          onOpenChange={setStarting}
          studentName={reciterName}
          run={hearing.run}
          defaultFrom={hearing.from}
          pending={pending}
          onStart={begin}
        />
      )}

      {mode === "hearing" && hearing ? (
        <HearingFinish
          open={wrapUp}
          onOpenChange={setWrapUp}
          from={range?.from ?? hearing.from}
          initialEnd={range ? initialEnd : hearing.from}
          minEnd={hearing.minEnd}
          names={hearing.names}
          passedBefore={hearing.passedBefore}
          pending={pending}
          onConfirm={finishHearing}
        />
      ) : (
        <Dialog open={wrapUp} onOpenChange={setWrapUp}>
          <DialogContent className="space-y-3">
            <DialogHeader><DialogTitle>Finish session</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              {SESSION_FLAGS.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.includes(f.id)}
                    onChange={(e) =>
                      setFlags((cur) =>
                        e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id),
                      )
                    }
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <Textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)}
              placeholder="Overall note for the session (optional)" rows={3} />
            <Button disabled={pending} onClick={submit}>
              {pending ? "Submitting…" : `Submit ${count} ${plural}`}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
