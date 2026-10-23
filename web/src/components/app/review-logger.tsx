"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader, type SurahNames } from "./mushaf-reader";
import { MushafPager } from "./mushaf-pager";
import { MistakeSheet, type SheetMark, type SheetResult } from "./mistake-sheet";
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { logHearingMistake, removeHearingMistake } from "@/lib/hifz/hearing-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import { markKey, wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

/** Same mistake type, so logging it again replaces it (logMistake agrees). */
const sameKind = (a: SheetMark, b: { category: Category; detail: string | null }) =>
  a.category === b.category && a.detail === b.detail;

/** The tapped token's target: an ayah end marker classifies the whole ayah,
 *  anything else the single word. */
const targetOf = (w: QuranWord) => ({
  surah: w.surah, ayah: w.ayah, position: w.isEnd ? null : w.position,
});

/**
 * The live logging island: tap a word → classify → it tints. Tapping an
 * ayah's END MARKER classifies the whole ayah instead, which is the commoner
 * slip — one row, tinting every word in it. A target can hold several
 * mistakes; tapping it again lists them and adds another. State is local
 * (each tap is one server action, no refresh).
 *
 * Two modes, one logger:
 *  · `peer` — a partner listening. "Listening to B · Finish" on top; Finish
 *    asks for flags and a note, then refreshes the page so the server swaps
 *    this for whatever comes after. The session always exists.
 *  · `hearing` — the teacher on the Hear tab. Every Save is logged at once
 *    for `studentId` (logHearingMistake finds or makes today's marking
 *    session), and a word marked today opens with its marks to Remove or
 *    add to. No Start, no End: the result is a separate step (Pass / Not
 *    passed). `initialMistakes` are today's marks; `heat`/`history` paint
 *    what earlier hearings said about the same words.
 */
export function ReviewLogger({
  mode = "peer",
  sessionId,
  studentId,
  reciterName,
  pages,
  initialMistakes,
  heat,
  history,
  surahNames,
  pager,
}: {
  mode?: "peer" | "hearing";
  /** Peer mode: the draft session. Hearing mode: unused (null). */
  sessionId: string | null;
  /** Hearing mode: who the taps are saved for. */
  studentId?: string;
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];   // the whole session — marks span pages
  heat?: Record<string, string>;                  // earlier hearings' tint
  history?: Record<string, WordHistoryEntry[]>;   // …and what they said
  surahNames?: SurahNames;
  pager?: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
}) {
  const router = useRouter();
  // markKey → every mark on that target this session, oldest first.
  const [marks, setMarks] = useState<Record<string, SheetMark[]>>(() => {
    const byTarget: Record<string, SheetMark[]> = {};
    for (const m of initialMistakes) {
      const k = markKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
      (byTarget[k] ??= []).push({ id: m.id, category: m.category, detail: m.detail, note: m.note });
    }
    return byTarget;
  });
  const [tapped, setTapped] = useState<QuranWord | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [overallNote, setOverallNote] = useState("");
  const [pending, startTransition] = useTransition();
  const hearing = mode === "hearing";

  /**
   * The write for one Save. It fires in the SAME synchronous tick as the
   * click that triggered it — no `await` sneaks in a microtask before the
   * write, which matters because the tests assert the mock was called
   * immediately after `fireEvent.click`.
   */
  const write = (target: ReturnType<typeof targetOf>, r: SheetResult): Promise<string> => {
    if (hearing) {
      if (!studentId) return Promise.reject(new Error("No student chosen."));
      return logHearingMistake(studentId, target, r.category, r.detail ?? undefined, r.note);
    }
    if (!sessionId) return Promise.reject(new Error("This session is closed. Reload the page."));
    return logMistake(sessionId, target, r.category, r.detail ?? undefined, r.note);
  };

  const save = (r: SheetResult) => {
    const word = tapped;
    if (!word) return;
    setTapped(null);
    const target = targetOf(word);
    startTransition(async () => {
      const newId = await write(target, r);
      const key = markKey(target);
      setMarks((m) => ({
        ...m,
        [key]: [
          ...(m[key] ?? []).filter((x) => !sameKind(x, r)),
          { id: newId, category: r.category, detail: r.detail, note: r.note },
        ],
      }));
    });
  };

  const remove = (id: string) => {
    const word = tapped;
    if (!word) return;
    const key = markKey(targetOf(word));
    setTapped(null);
    startTransition(async () => {
      await (hearing ? removeHearingMistake(id) : removeMistake(id));
      setMarks((m) => {
        const left = (m[key] ?? []).filter((x) => x.id !== id);
        const next = { ...m, [key]: left };
        if (!left.length) delete next[key];
        return next;
      });
    });
  };

  const submit = () =>
    startTransition(async () => {
      if (!sessionId) throw new Error("This session is closed. Reload the page.");
      await submitSession(sessionId, flags, overallNote);
      setWrapUp(false);
      router.refresh();
    });

  const count = Object.values(marks).reduce((n, list) => n + list.length, 0);
  const plural = count === 1 ? "mistake" : "mistakes";
  const existing = tapped ? marks[markKey(targetOf(tapped))] : undefined;
  // The reader only needs to know a target is marked; it tints the same.
  const tinted = Object.fromEntries(
    Object.entries(marks).filter(([, list]) => list.length).map(([k, list]) => [k, list[0]]),
  );
  // spreadHeat keys history by wordKey for every word, end markers included.
  const previous = tapped ? history?.[wordKey(tapped)] : undefined;

  const reader = (
    <MushafReader pages={pages} marks={tinted} heat={heat} surahNames={surahNames} onWordTap={setTapped} />
  );

  return (
    <div className="space-y-3">
      <div className="glass sticky top-[calc(var(--chrome-top,0px)+0.5rem)] z-10 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5">
        {hearing ? (
          <>
            <p className="min-w-0 text-sm tabular-nums">{count} {plural} marked today</p>
            {studentId && (
              <Link href={`/teacher/hifdh/${studentId}`} className="shrink-0 text-sm underline">
                {reciterName}&apos;s page
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">
              Listening to <span className="font-medium">{reciterName}</span>
              <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                {count} {plural}
              </span>
            </p>
            <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>Finish</Button>
          </>
        )}
      </div>

      {/* `mushaf-bleed`: on a phone the page fills this full-width box
          exactly, so the words being tapped are as large as the width
          allows. Outside the pager, which shrinks to fit its page and so
          cannot be what the page measures itself against. */}
      <div className="mushaf-bleed">
        {pager ? <MushafPager {...pager}>{reader}</MushafPager> : reader}
      </div>

      <MistakeSheet
        key={tapped ? markKey(targetOf(tapped)) : "closed"}
        word={tapped}
        existing={existing}
        previous={previous}
        onSave={save}
        onRemove={remove}
        onClose={() => setTapped(null)}
      />

      {!hearing && (
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
