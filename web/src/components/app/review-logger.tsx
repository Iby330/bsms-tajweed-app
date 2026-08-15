"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader } from "./mushaf-reader";
import { MistakeSheet, type SheetResult } from "./mistake-sheet";
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

type Mark = { id?: string; category: Category; detail: string | null; note: string | null };

/**
 * The live logging island: tap a word → classify → it tints. State is local
 * (each tap is one server action, no refresh); submit refreshes the page so
 * the server swaps this for the feedback view.
 */
export function ReviewLogger({
  sessionId,
  reciterName,
  pages,
  initialMistakes,
}: {
  sessionId: string;
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      initialMistakes.map((m) => [
        wordKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position }),
        { id: m.id, category: m.category, detail: m.detail, note: m.note },
      ]),
    ),
  );
  const [tapped, setTapped] = useState<QuranWord | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [overallNote, setOverallNote] = useState("");
  const [pending, startTransition] = useTransition();

  const save = (r: SheetResult) => {
    const word = tapped;
    if (!word) return;
    setTapped(null);
    startTransition(async () => {
      const id = await logMistake(
        sessionId,
        { surah: word.surah, ayah: word.ayah, position: word.position },
        r.category,
        r.detail ?? undefined,
        r.note,
      );
      setMarks((m) => ({
        ...m,
        [wordKey(word)]: { id, category: r.category, detail: r.detail, note: r.note },
      }));
    });
  };

  const remove = () => {
    const word = tapped;
    if (!word) return;
    const mark = marks[wordKey(word)];
    setTapped(null);
    if (!mark?.id) return;
    startTransition(async () => {
      await removeMistake(mark.id!);
      setMarks((m) => {
        const next = { ...m };
        delete next[wordKey(word)];
        return next;
      });
    });
  };

  const submit = () =>
    startTransition(async () => {
      await submitSession(sessionId, flags, overallNote);
      setWrapUp(false);
      router.refresh();
    });

  const count = Object.keys(marks).length;
  const plural = count === 1 ? "mistake" : "mistakes";
  const existing = tapped ? marks[wordKey(tapped)] : undefined;

  return (
    <div className="space-y-3">
      <div className="glass sticky top-2 z-10 flex items-center justify-between rounded-xl px-4 py-2.5">
        <p className="text-sm">
          Listening to <span className="font-medium">{reciterName}</span>
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
            {count} {plural}
          </span>
        </p>
        <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>Finish</Button>
      </div>

      <MushafReader pages={pages} marks={marks} onWordTap={setTapped} />

      <MistakeSheet
        key={tapped ? wordKey(tapped) : "closed"}
        word={tapped}
        existing={existing}
        onSave={save}
        onRemove={existing ? remove : undefined}
        onClose={() => setTapped(null)}
      />

      <Dialog open={wrapUp} onOpenChange={setWrapUp}>
        <DialogContent className="max-w-sm space-y-3">
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
    </div>
  );
}
