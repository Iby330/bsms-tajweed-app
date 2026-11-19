"use client";

/**
 * The builder: the bank on the left, the paper in the middle, print and
 * finish at the top right. On a phone or tablet the paper fills the screen
 * and the bank opens as a sheet from a button.
 *
 * This component owns the paper's state. Every change shows at once, then
 * goes to the server; if the server refuses, the change is undone and the
 * reason shown under the top bar. The actions deliberately revalidate
 * nothing (see lib/exam-builder/actions.ts), so a save never re-renders the
 * route: the state here is seeded once from the server and is the truth on
 * screen from then on, so pictures don't reload and nothing jumps while a
 * teacher is working.
 *
 * "Write a new question" opens a dialog; the question goes into the bank and
 * onto the paper (or onto the paper only, when kept out of the bank), and
 * shows in the bank panel at once under its topic.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Library, Loader2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as A from "@/lib/exam-builder/actions";
import { addBankQuestion, addCustomItem } from "@/lib/exam-builder/new-question-actions";
import { usedLabel, suggestSection } from "@/lib/exam-builder/labels";
import { formatMarks, paperTotal } from "@/lib/exam-builder/numbering";
import type { LoadedPaper } from "@/lib/exam-builder/queries";
import type { SnippetWord } from "@/lib/exam-builder/quran-lines";
import type { BankQuestion, Paper, QuestionKind, Result, SectionKind, Topic } from "@/lib/exam-builder/types";
import { BankPanel, type BankAdd } from "./bank-panel";
import { ExportMenu } from "./export-menu";
import { useFitPictures } from "./fit-pictures";
import { ItemEditor, type ItemPatch } from "./item-editor";
import { NewQuestionForm, type NewQuestionInput } from "./new-question-form";
import { PaperCanvas } from "./paper-canvas";
import { PaperHeaderForm } from "./paper-header-form";
import { StatusChip } from "./paper-list";
import * as L from "./paper-state";
import { primeQuranWords } from "./use-quran-words";
import "./exam-builder.css";

type State = L.PaperState;

export function Workspace({
  initial,
  topics,
  questions: initialQuestions,
  profileId,
  quranWords,
}: {
  initial: LoadedPaper;
  topics: Topic[];
  questions: BankQuestion[];
  /** The signed-in teacher: new pictures upload under new/<profileId>/. */
  profileId: string;
  /** The words of the typeset ayahs already on the paper, by snippetKey. */
  quranWords?: Record<string, SnippetWord[]>;
}) {
  // Before the first render, so those ayahs render with the page.
  useState(() => primeQuranWords(quranWords));
  const [state, setStateRaw] = useState<State>(() => ({
    paper: initial.paper, sections: initial.sections, items: initial.items,
  }));
  const ref = useRef(state);
  const setState = useCallback((fn: (s: State) => State) => {
    setStateRaw((s) => {
      const n = fn(s);
      ref.current = n;
      return n;
    });
  }, []);
  const [questions, setQuestions] = useState(initialQuestions);
  useFitPictures();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Nothing revalidates on save, so a page the router kept from before (the
  // list, reached with the browser's Back button) would show old counts.
  // Leaving after a change refreshes whatever page we land on: one cheap fetch.
  const router = useRouter();
  const changed = useRef(false);
  useEffect(() => {
    if (saved) changed.current = true;
  }, [saved]);
  useEffect(() => () => {
    if (changed.current) router.refresh();
  }, [router]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [writingIn, setWritingIn] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState<SectionKind | null>(null);

  const { paper, sections, items } = state;
  const locked = paper.status === "final";

  /** Show the change now, send it, undo it if the server says no. */
  const commit = useCallback(
    <T extends object>(apply: (s: State) => State, call: () => Promise<Result<T>>, onOk?: (r: { ok: true } & T) => void) => {
      const before = ref.current;
      setState(apply);
      setError(null);
      startTransition(async () => {
        let res: Result<T>;
        try {
          res = await call();
        } catch {
          res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
        }
        if (!res.ok) {
          setState(() => before);
          setError(res.error);
        } else {
          setSaved(true);
          onOk?.(res);
        }
      });
    },
    [setState],
  );

  /** For dialogs: same as commit, but hands the result back so the dialog can show a refusal. */
  const commitAwait = useCallback(
    (apply: (s: State) => State, call: () => Promise<Result>): Promise<Result> =>
      new Promise((resolve) => {
        const before = ref.current;
        setState(apply);
        setError(null);
        startTransition(async () => {
          let res: Result;
          try {
            res = await call();
          } catch {
            res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
          }
          if (!res.ok) setState(() => before);
          else setSaved(true);
          resolve(res);
        });
      }),
    [setState],
  );

  const flash = (id: string) => {
    setFlashId(id);
    requestAnimationFrame(() =>
      document.getElementById(`item-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };

  const ops: L.PaperOps = {
    editHeader: () => setHeaderOpen(true),
    renameSection: (id, title) =>
      commit((s) => L.updateSectionLocal(s, id, { title }), () => A.updateSection(id, { title })),
    updatePractical: (id, practical) =>
      commit((s) => L.updateSectionLocal(s, id, { practical }), () => A.updateSection(id, { practical })),
    moveSection: (id, dir) => commit((s) => L.moveSectionLocal(s, id, dir), () => A.moveSection(id, dir)),
    removeSection: (id) => commit((s) => L.removeSectionLocal(s, id), () => A.removeSection(id)),
    addSection: (kind) => {
      setAddingSection(kind);
      commit((s) => s, async () => {
        try {
          return await A.addSection(paper.id, kind);
        } finally {
          setAddingSection(null);
        }
      }, (r) => {
        setState((s) => L.addSectionLocal(s, r.section));
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLTextAreaElement>(`[data-section-title="${r.section.id}"]`);
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          el?.select();
        });
      });
    },
    writeNew: (sectionId) => setWritingIn(sectionId),
    editItem: (id) => setEditingId(id),
    moveItem: (id, dir) => commit((s) => L.moveItemLocal(s, id, dir), () => A.moveItem(id, dir)),
    moveItemToSection: (id, sectionId) =>
      commit((s) => L.moveItemToSectionLocal(s, id, sectionId), () => A.moveItemToSection(id, sectionId), () => flash(id)),
    removeItem: (id) => commit((s) => L.removeItemLocal(s, id), () => A.removeItem(id)),
  };

  const addFromBank = (q: BankQuestion, sectionId: string) => {
    const tempId = `temp-${q.id}`;
    const temp: L.Item = {
      id: tempId, paper_id: paper.id, section_id: sectionId, position: 0, bank_question_id: q.id,
      kind: q.kind, prompt: q.prompt, prompt_images: q.prompt_images, prompt_quran: q.prompt_quran,
      options: q.options, select_many: q.select_many, answer: q.answer,
      marks: q.marks && q.marks > 0 ? q.marks : 1, answer_lines: q.kind === "mcq" ? 0 : 2, imageUrls: q.imageUrls,
    };
    commit((s) => L.appendItemLocal(s, temp), () => A.addItemFromBank(paper.id, sectionId, q.id), (r) => {
      setState((s) => L.replaceItemLocal(s, tempId, { ...r.item, imageUrls: q.imageUrls }));
      flash(r.item.id);
    });
  };

  /** "Write a new question": into the bank and onto the paper, or onto the paper only. */
  const submitNew = async (q: NewQuestionInput, keepOut: boolean, imageUrls: Record<string, string>): Promise<string | void> => {
    const sectionId = writingIn;
    if (!sectionId) return "Choose a section first.";
    setError(null);
    if (keepOut) {
      const res = await addCustomItem(paper.id, sectionId, q);
      if (!res.ok) return res.error;
      setState((s) => L.appendItemLocal(s, { ...res.item, imageUrls: { ...imageUrls, ...res.imageUrls } }));
      setSaved(true);
      flash(res.item.id);
      return;
    }
    const res = await addBankQuestion(q, { paperId: paper.id, sectionId });
    if (!res.ok) return res.error;
    const question = res.question;
    setQuestions((qs) => [...qs, question]);
    setReveal(question.topic_id);
    setSaved(true);
    if (res.item) {
      const item = res.item;
      setState((s) => L.appendItemLocal(s, { ...item, imageUrls: question.imageUrls }));
      flash(item.id);
    } else if (res.addError) {
      setError(`It's in the bank, but it wasn't put on the paper: ${res.addError}`);
    }
  };

  const saveItem = (id: string, patch: ItemPatch) =>
    commitAwait((s) => L.updateItemLocal(s, id, patch), () => A.updateItem(id, patch));

  const saveHeader = (patch: Partial<Paper>) =>
    commitAwait((s) => L.updatePaperLocal(s, patch), () => A.updatePaper(paper.id, patch));

  const setFinal = async (final: boolean): Promise<string | void> => {
    const res = await commitAwait(
      (s) => L.updatePaperLocal(s, { status: final ? "final" : "draft" }),
      () => A.setPaperFinal(paper.id, final),
    );
    if (!res.ok) return res.error;
    // Keep the bank's "used in" chips honest without a reload.
    const label = usedLabel(paper.code, paper.season);
    const onPaper = new Set(items.flatMap((i) => (i.bank_question_id ? [i.bank_question_id] : [])));
    setQuestions((qs) =>
      qs.map((q) => {
        if (!onPaper.has(q.id)) return q;
        const has = q.used_in.includes(label);
        if (final && !has) return { ...q, used_in: [...q.used_in, label] };
        if (!final && has) return { ...q, used_in: q.used_in.filter((u) => u !== label) };
        return q;
      }),
    );
  };

  const ordered = L.orderedSections(sections);
  const questionSections = ordered.filter((s) => s.kind === "questions");
  const total = paperTotal(ordered, items);
  // Every question on the paper, bank or not; a question still being saved is not counted yet.
  const questionCount = items.filter((i) => !i.id.startsWith("temp-")).length;
  const addedIds = useMemo(
    () => new Set(items.flatMap((i) => (i.bank_question_id ? [i.bank_question_id] : []))),
    [items],
  );
  const bankAdd: BankAdd = {
    addedIds,
    sections: questionSections.map((s) => ({ id: s.id, title: s.title })),
    suggest: (kind: QuestionKind) => suggestSection(kind, questionSections)?.id ?? null,
    onAdd: addFromBank,
    locked,
  };
  const editing = editingId ? items.find((i) => i.id === editingId) ?? null : null;

  const status = pending ? (
    <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…</span>
  ) : error ? null : saved ? (
    <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-ok" aria-hidden /> Saved</span>
  ) : null;

  return (
    <div className="exam-ws pb-24 lg:pb-10">
      {/* top bar */}
      <div className="sticky top-[var(--chrome-top,0px)] z-30 -mx-[var(--gutter)] border-b border-line bg-background/95 px-[var(--gutter)] backdrop-blur supports-backdrop-filter:bg-background/80 lg:top-0">
        <div className="flex min-h-14 items-center gap-3 py-2">
          <Link href="/teacher/exam-builder" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Back to your papers" title="Back to your papers">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold sm:text-lg">{paper.title}</h1>
              <StatusChip final={locked} className="shrink-0" />
            </div>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground" aria-live="polite">
              <span className="font-mono tracking-[0.08em] uppercase">{paper.code} · {paper.season}</span>
              <span><b className="font-semibold text-foreground tabular-nums">{questionCount}</b> {questionCount === 1 ? "question" : "questions"}</span>
              <span><b className="font-semibold text-foreground tabular-nums">{formatMarks(total)}</b> marks</span>
              {status}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="max-md:hidden"
            onClick={() => setShowAnswers((v) => !v)}
            aria-pressed={showAnswers}
          >
            {showAnswers ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {showAnswers ? "Hide answers" : "Show answers"}
          </Button>
          <ExportMenu paper={paper} bankCount={addedIds.size} onSetFinal={setFinal} />
        </div>
        {error && <p className="pb-2 text-xs text-danger" role="alert">{error}</p>}
      </div>

      {locked && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ok/15 px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-ok">
            <Lock className="size-4" aria-hidden /> This paper is final. Its bank questions are stamped {usedLabel(paper.code, paper.season)}.
          </span>
          <span className="text-muted-foreground">Reopen it from Print &amp; finish to make changes.</span>
        </div>
      )}

      <div className="mt-4 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-6">
        <aside
          aria-label="Question bank"
          className="hidden lg:sticky lg:top-[4.5rem] lg:flex lg:h-[calc(100dvh-5.5rem)] lg:flex-col lg:overflow-hidden lg:border lg:border-line lg:bg-card"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Library className="size-4 text-brand" aria-hidden />
            <h2 className="text-sm font-semibold">Question bank</h2>
            <span className="ml-auto text-xs text-muted-foreground">Open a series, then a rule</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <BankPanel topics={topics} questions={questions} add={bankAdd} reveal={reveal} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end md:hidden">
            <Button variant="ghost" size="sm" onClick={() => setShowAnswers((v) => !v)} aria-pressed={showAnswers}>
              {showAnswers ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {showAnswers ? "Hide answers" : "Show answers"}
            </Button>
          </div>
          <PaperCanvas
            paper={paper}
            sections={sections}
            items={items}
            ops={ops}
            locked={locked}
            showAnswers={showAnswers}
            flashId={flashId}
            addingSection={addingSection}
          />
          {locked && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => setFinal(false).then((e) => { if (e) setError(e); })}>
                <LockOpen aria-hidden /> Reopen for editing
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* phone / tablet: the bank as a sheet */}
      <div className="fixed right-4 bottom-[calc(var(--chrome-bottom,0px)+16px)] z-30 lg:hidden">
        <Button size="lg" className="h-12 rounded-full px-5 shadow-lg" onClick={() => setBankOpen(true)}>
          <Library aria-hidden /> Question bank
        </Button>
      </div>
      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent frameClassName="sm:max-w-2xl h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-4rem)]" className="gap-0 p-0 pb-0 sm:pb-0">
          <DialogHeader className="border-b border-line p-4">
            <DialogTitle>Question bank</DialogTitle>
            <DialogDescription>
              {questionCount} on the paper · {formatMarks(total)} marks. Added questions go straight onto the paper.
            </DialogDescription>
          </DialogHeader>
          <BankPanel topics={topics} questions={questions} add={bankAdd} reveal={reveal} />
        </DialogContent>
      </Dialog>

      <NewQuestionForm
        open={writingIn !== null}
        onOpenChange={(o) => { if (!o) setWritingIn(null); }}
        topics={topics}
        profileId={profileId}
        mode="paper"
        defaultKind={sections.find((x) => x.id === writingIn)?.title.toLowerCase().includes("multiple") ? "mcq" : "short"}
        onSubmit={submitNew}
      />
      <ItemEditor item={editing} onOpenChange={(o) => { if (!o) setEditingId(null); }} onSave={saveItem} />
      <PaperHeaderForm open={headerOpen} onOpenChange={setHeaderOpen} paper={paper} onSave={saveHeader} />
    </div>
  );
}
