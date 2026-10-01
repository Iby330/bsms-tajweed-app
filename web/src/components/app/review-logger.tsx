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
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { submitHearing } from "@/lib/hifz/hearing-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import { endSurahFor, lastSurahOn } from "@/lib/hifz/hearings";
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
 *    asks for flags and a note.
 *  · `hearing` — the teacher, on the Thursday lesson. "Hearing B" on top.
 *    Finish opens the range popup: the range as rows, a tick per surah, and
 *    a note; Confirm signs off the ticked surahs and leaves the unticked
 *    ones heard-not-passed. The draft may not exist yet: `sessionId` is
 *    null until the first tap or Finish, when `ensureSession` creates it.
 *    `heat`/`history` paint what earlier hearings said about the same
 *    words.
 */
export type SessionProps =
  // A session already exists (peer mode always, hearing mode once heard
  // before) — ensureSession is unused, so it's fine unset.
  | { sessionId: string; ensureSession?: () => Promise<string> }
  // No draft yet — only a hearing can be in this state, and only
  // `ensureSession` can get it a session id, so it's required here.
  | { sessionId: null; ensureSession: () => Promise<string> };

export function ReviewLogger({
  mode = "peer",
  sessionId,
  ensureSession,
  reciterName,
  pages,
  initialMistakes,
  heat,
  history,
  surahNames,
  pager,
  hearing,
}: SessionProps & {
  mode?: "peer" | "hearing";
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];   // the whole session — marks span pages
  heat?: Record<string, string>;                  // earlier hearings' tint
  history?: Record<string, WordHistoryEntry[]>;   // …and what they said
  surahNames?: SurahNames;
  pager?: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
  /** Hearing mode only: the range's start, the run's last surah, and what
   *  the popup needs. `endFromPage` proposes the end of the range from the
   *  page on screen — set only on the desk, which turns pages one at a time
   *  via `pager`; the per-surah page leaves it unset, so the end stays the
   *  start. */
  hearing?: {
    from: number;
    minEnd: number;
    names: SurahNames;
    passedBefore: Record<number, string>;
    endFromPage?: boolean;
    onFinished?: (sessionId: string) => void;
  };
}) {
  const router = useRouter();
  const [sid, setSid] = useState<string | null>(sessionId);
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      initialMistakes.map((m) => [
        markKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position }),
        { id: m.id, category: m.category, detail: m.detail, note: m.note },
      ]),
    ),
  );
  const [tapped, setTapped] = useState<QuranWord | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [overallNote, setOverallNote] = useState("");
  const [pending, startTransition] = useTransition();

  /**
   * The session to write to, creating the draft on first use. When one is
   * already known, `write` fires in the SAME synchronous tick as the click
   * that triggered it — no `await` on an already-known id sneaks in a
   * microtask before the write, which matters because peer mode's tests
   * assert the mock was called immediately after `fireEvent.click`, before
   * awaiting anything.
   *
   * `sid` goes back to null after a hearing's Finish (the page refreshes in
   * place, so this logger can outlive the hearing it submitted), and the
   * next write then opens a new draft through `ensureSession` — which is
   * why hearing pages pass it even when a draft already exists. Peer mode's
   * `sid` never goes back to null, so it never reaches the last branch.
   */
  const withSession = (write: (id: string) => Promise<void>) => {
    if (sid) return write(sid);
    if (!ensureSession) return Promise.reject(new Error("This session is closed. Reload the page."));
    return ensureSession().then((id) => {
      setSid(id);
      return write(id);
    });
  };

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
    <MushafReader pages={pages} marks={marks} heat={heat} surahNames={surahNames} onWordTap={setTapped} />
  );

  // markKey is "surah:ayah" or "surah:ayah:position": the surah is always first.
  const markSurahs = Object.keys(marks).map((k) => Number(k.split(":")[0]));
  // Only the desk (endFromPage set) feeds the pager's page into the end
  // calculation. On a per-surah page (no endFromPage) the last surah on the
  // page could be the NEXT surah when it starts partway down — that would
  // widen a single-surah hearing to a range of two, so pass null there and
  // let endSurahFor default the end to the start.
  const pageForEnd = hearing?.endFromPage && pager ? pager.page : null;
  const initialEnd = hearing
    ? endSurahFor(hearing.from, pageForEnd == null ? null : lastSurahOn(pages, pageForEnd), markSurahs)
    : 0;
  const finishHearing = (v: Verdict) =>
    startTransition(() =>
      withSession(async (id) => {
        await submitHearing(id, v);
        setWrapUp(false);
        // The hearing is closed: the next tap starts a new draft rather
        // than writing into this one, and its marks are no longer live.
        setSid(null);
        setMarks({});
        router.refresh();
        hearing?.onFinished?.(id);
      }),
    );

  return (
    <div className="space-y-3">
      <div className="glass sticky top-[calc(var(--chrome-top,0px)+0.5rem)] z-10 flex items-center justify-between rounded-xl px-4 py-2.5">
        <p className="text-sm">
          {mode === "hearing" ? "Hearing " : "Listening to "}
          <span className="font-medium">{reciterName}</span>
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
            {count} {plural}
          </span>
        </p>
        <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>Finish</Button>
      </div>

      {pager ? <MushafPager {...pager}>{reader}</MushafPager> : reader}

      <MistakeSheet
        key={tapped ? markKey(targetOf(tapped)) : "closed"}
        word={tapped}
        existing={existing}
        previous={previous}
        onSave={save}
        onRemove={existing ? remove : undefined}
        onClose={() => setTapped(null)}
      />

      {mode === "hearing" && hearing ? (
        <HearingFinish
          open={wrapUp}
          onOpenChange={setWrapUp}
          from={hearing.from}
          initialEnd={initialEnd}
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
