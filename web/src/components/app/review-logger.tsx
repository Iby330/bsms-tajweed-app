"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader, type SurahNames } from "./mushaf-reader";
import { MushafPager } from "./mushaf-pager";
import { MistakeSheet, type SheetResult } from "./mistake-sheet";
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { submitHearing } from "@/lib/hifz/hearing-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import type { HearingOutcome } from "@/lib/hifz/hearings";
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
 *  · `hearing` — the teacher, on the Thursday lesson. "Hearing B" on top,
 *    the verdict bar below: Passed / Not passed, each with a note. The
 *    draft may not exist yet: `sessionId` is null until the first tap or
 *    verdict, when `ensureSession` creates it. `heat`/`history` paint what
 *    earlier hearings said about the same words.
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
}: SessionProps & {
  mode?: "peer" | "hearing";
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];   // the whole session — marks span pages
  heat?: Record<string, string>;                  // earlier hearings' tint
  history?: Record<string, WordHistoryEntry[]>;   // …and what they said
  surahNames?: SurahNames;
  pager?: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
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
  const [verdict, setVerdict] = useState<HearingOutcome | null>(null);
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
   * The middle branch is unreachable at runtime (`sid` starts as
   * `sessionId` and only ever moves null → a string, never back), but it's
   * what lets TypeScript prove `ensureSession` is defined below without a
   * `!` — the props type only guarantees that when `sessionId` (not `sid`)
   * is null.
   */
  const withSession = (write: (id: string) => Promise<void>) => {
    if (sid) return write(sid);
    if (sessionId !== null) return write(sessionId);
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

  const confirmVerdict = () => {
    const outcome = verdict;
    if (!outcome) return;
    startTransition(() =>
      withSession(async (id) => {
        await submitHearing(id, outcome, overallNote);
        setVerdict(null);
        setOverallNote("");
        router.refresh();
      }),
    );
  };

  const count = Object.keys(marks).length;
  const plural = count === 1 ? "mistake" : "mistakes";
  const existing = tapped ? marks[markKey(targetOf(tapped))] : undefined;
  // spreadHeat keys history by wordKey for every word, end markers included.
  const previous = tapped ? history?.[wordKey(tapped)] : undefined;

  const reader = (
    <MushafReader pages={pages} marks={marks} heat={heat} surahNames={surahNames} onWordTap={setTapped} />
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
        {mode === "peer" && (
          <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>Finish</Button>
        )}
      </div>

      {pager ? <MushafPager {...pager}>{reader}</MushafPager> : reader}

      {mode === "hearing" && (
        <div className="glass sticky bottom-2 z-10 flex items-center justify-between rounded-xl px-4 py-2.5">
          {/* Bare count, not "N mistakes" — the header above already
              spells that out, and repeating the exact phrase here reads
              as noise beside the verdict buttons. The word is still there
              for a screen reader (sr-only), split into its own node so it
              doesn't itself read back as "N mistakes" and collide with
              the header's text in a lookup by that phrase. */}
          <p className="text-xs tabular-nums text-muted-foreground">
            {count}
            <span className="sr-only"> {plural}</span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setVerdict("not_passed")}>
              Not passed
            </Button>
            <Button size="sm" disabled={pending} onClick={() => setVerdict("passed")}>
              Passed
            </Button>
          </div>
        </div>
      )}

      <MistakeSheet
        key={tapped ? markKey(targetOf(tapped)) : "closed"}
        word={tapped}
        existing={existing}
        previous={previous}
        onSave={save}
        onRemove={existing ? remove : undefined}
        onClose={() => setTapped(null)}
      />

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

      <Dialog
        open={verdict !== null}
        onOpenChange={(o) => {
          if (o) return;
          // A note typed under one verdict and then abandoned must not
          // silently ride along with a later, different verdict.
          setVerdict(null);
          setOverallNote("");
        }}
      >
        <DialogContent className="max-w-sm space-y-3">
          <DialogHeader>
            <DialogTitle>{verdict === "passed" ? "Passed" : "Not passed"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {count} {plural} marked. The note is optional and the student sees it.
          </p>
          <Textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)}
            placeholder="Note for the student (optional)" rows={3} />
          <Button disabled={pending} onClick={confirmVerdict}>
            {pending ? "Saving…" : verdict === "passed" ? "Confirm pass" : "Confirm not passed"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
