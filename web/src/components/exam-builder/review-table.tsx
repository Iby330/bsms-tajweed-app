"use client";

/**
 * The admin's pass over the imported bank: a summary strip that doubles as
 * the pile picker, filters, and one card per question with everything needed
 * to judge it (why it was flagged, prompt and pictures, options with the
 * right one ticked, the answer, marks, topic, sources). Approve, Edit, Bin.
 *
 * Local state is the source of truth once loaded: every action is applied
 * here at once and rolled back if the server refuses. A question that leaves
 * the current pile (approved, binned) collapses to a one-line stub with Undo
 * rather than vanishing, until the filters change.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MixedText } from "@/components/app/mixed-text";
import { OptionList, QuestionPrompt } from "@/components/exam-builder/question-prompt";
import { approveBankQuestion, archiveBankQuestion, updateBankQuestion } from "@/lib/exam-builder/bank-actions";
import { splitReviewNote } from "@/lib/exam-builder/bank-validate";
import { groupTopics, topicPath } from "@/lib/exam-builder/topics";
import type { BankQuestion, ReviewStatus, Topic } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { ReviewEditDialog } from "./review-edit-dialog";
import {
  DEFAULT_FILTERS, hasAnswer, isNarrowed, reviewCounts, reviewMatcher, type ReviewFilters, type ReviewView,
} from "./review-filter";

const PAGE = 25;

type Stub = { kind: "approved"; was: ReviewStatus } | { kind: "binned" } | { kind: "restored" };

const STATUS_CHIP: Record<ReviewStatus | "binned", { text: string; cls: string }> = {
  check: { text: "Needs a look", cls: "bg-warn/15 text-warn" },
  approved: { text: "Approved", cls: "bg-ok/15 text-ok" },
  clean: { text: "Clean", cls: "bg-brand/15 text-brand" },
  binned: { text: "Binned", cls: "bg-danger/15 text-danger" },
};

const KIND_TEXT = { mcq: "Multiple choice", short: "Short answer" } as const;
const SOURCE_KIND = { exam: "exam", bank: "question bank", mark_scheme: "mark scheme", form: "form" } as const;

function marksText(m: number | null) {
  if (m === null || m === undefined) return null;
  return `${m} ${m === 1 ? "mark" : "marks"}`;
}

export function ReviewTable({ initial, topics }: { initial: BankQuestion[]; topics: Topic[] }) {
  const [questions, setQuestions] = useState(initial);
  const [filters, setFiltersRaw] = useState<ReviewFilters>(DEFAULT_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [stubs, setStubs] = useState<Record<string, Stub>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, true>>({});

  const counts = useMemo(() => reviewCounts(questions), [questions]);
  const groups = useMemo(() => groupTopics(topics), [topics]);
  const matches = useMemo(() => reviewMatcher(filters, topics), [filters, topics]);
  const visible = useMemo(
    () => questions.filter((q) => matches(q) || stubs[q.id] || saved[q.id]),
    [questions, matches, stubs, saved],
  );
  const shown = visible.slice(0, limit);
  const editingQ = editing ? questions.find((q) => q.id === editing) : undefined;

  function setFilters(change: Partial<ReviewFilters>) {
    setFiltersRaw((f) => ({ ...f, ...change }));
    setLimit(PAGE);
    setStubs({});
    setSaved({});
  }

  function patchLocal(id: string, patch: Partial<BankQuestion>) {
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function setError(id: string, msg: string | null) {
    setErrors((e) => {
      const next = { ...e };
      if (msg) next[id] = msg; else delete next[id];
      return next;
    });
  }
  function setStub(id: string, stub: Stub | null) {
    setStubs((s) => {
      const next = { ...s };
      if (stub) next[id] = stub; else delete next[id];
      return next;
    });
  }

  async function approve(q: BankQuestion) {
    const was = q.review_status;
    setError(q.id, null);
    patchLocal(q.id, { review_status: "approved" });
    if (filters.view !== "approved" && filters.view !== "all") setStub(q.id, { kind: "approved", was });
    const r = await approveBankQuestion(q.id);
    if (!r.ok) { patchLocal(q.id, { review_status: was }); setStub(q.id, null); setError(q.id, r.error); }
  }

  async function undoApprove(q: BankQuestion, was: ReviewStatus) {
    setStub(q.id, null);
    patchLocal(q.id, { review_status: was });
    const r = await updateBankQuestion(q.id, { review_status: was });
    if (!r.ok) { patchLocal(q.id, { review_status: "approved" }); setError(q.id, r.error); }
  }

  async function bin(q: BankQuestion, archived: boolean) {
    setError(q.id, null);
    patchLocal(q.id, { archived });
    // Leaving the pile shows a stub with Undo; coming back (Undo / Restore) clears it.
    if (archived) setStub(q.id, { kind: "binned" });
    else setStub(q.id, filters.view === "binned" ? { kind: "restored" } : null);
    const r = await archiveBankQuestion(q.id, archived);
    if (!r.ok) { patchLocal(q.id, { archived: !archived }); setStub(q.id, null); setError(q.id, r.error); }
  }

  const strip: { key: string; label: string; n: number; on: boolean; pick: () => void }[] = [
    { key: "check", label: "Need a look", n: counts.check, on: filters.view === "check" && !filters.noAnswer, pick: () => setFilters({ view: "check", noAnswer: false }) },
    { key: "approved", label: "Approved", n: counts.approved, on: filters.view === "approved" && !filters.noAnswer, pick: () => setFilters({ view: "approved", noAnswer: false }) },
    { key: "clean", label: "Clean, not looked at", n: counts.clean, on: filters.view === "clean" && !filters.noAnswer, pick: () => setFilters({ view: "clean", noAnswer: false }) },
    { key: "noAnswer", label: "No answer", n: counts.noAnswer, on: filters.view === "all" && filters.noAnswer, pick: () => setFilters({ view: "all", noAnswer: true }) },
    { key: "all", label: "In the bank", n: counts.all, on: filters.view === "all" && !filters.noAnswer, pick: () => setFilters({ view: "all", noAnswer: false }) },
    { key: "binned", label: "Binned", n: counts.binned, on: filters.view === "binned", pick: () => setFilters({ view: "binned", noAnswer: false }) },
  ];

  const selectCls = "h-8 min-w-0 rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30";

  return (
    <div className="space-y-5 pb-16">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {strip.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={s.on}
            onClick={s.pick}
            className={cn(
              "cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors",
              s.on
                ? "border-brand/40 bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            <span className="block text-2xl font-semibold tabular-nums leading-none">{s.n}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5">
        <Input
          type="search" placeholder="Search the wording, answer or note" value={filters.text}
          onChange={(e) => setFilters({ text: e.target.value })} className="h-8 w-full bg-card sm:w-72"
          aria-label="Search"
        />
        <select aria-label="Topic" className={cn(selectCls, "w-full sm:w-auto")} value={filters.topicId} onChange={(e) => setFilters({ topicId: e.target.value })}>
          <option value="">Every topic</option>
          {groups.map((g) => g.children.length ? (
            <optgroup key={g.topic.id} label={g.topic.title}>
              <option value={g.topic.id}>All of {g.topic.title}</option>
              {g.children.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </optgroup>
          ) : <option key={g.topic.id} value={g.topic.id}>{g.topic.title}</option>)}
        </select>
        <select aria-label="Type" className={cn(selectCls, "w-full sm:w-auto")} value={filters.kind} onChange={(e) => setFilters({ kind: e.target.value as ReviewFilters["kind"] })}>
          <option value="">Both types</option>
          <option value="mcq">Multiple choice</option>
          <option value="short">Short answer</option>
        </select>
        <select aria-label="Status" className={cn(selectCls, "w-full sm:w-auto")} value={filters.view} onChange={(e) => setFilters({ view: e.target.value as ReviewView })}>
          <option value="check">Needs a look</option>
          <option value="approved">Approved</option>
          <option value="clean">Clean</option>
          <option value="all">Everything in the bank</option>
          <option value="binned">Binned</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={filters.noAnswer} onChange={(e) => setFilters({ noAnswer: e.target.checked })} />
          No answer
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={filters.hasPicture} onChange={(e) => setFilters({ hasPicture: e.target.checked })} />
          Has a picture
        </label>
        {isNarrowed(filters) && (
          <Button size="sm" variant="ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS, view: filters.view })}>
            Clear filters
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {visible.length === 0 ? null : `Showing ${Math.min(limit, visible.length)} of ${visible.length}.`}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center">
          <p className="font-medium">
            {filters.view === "check" && !isNarrowed(filters)
              ? "Nothing needs a look. Every flagged question has been dealt with."
              : filters.view === "binned" && !isNarrowed(filters)
                ? "The bin is empty."
                : "No questions match these filters."}
          </p>
          {isNarrowed(filters) && (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setFilters({ ...DEFAULT_FILTERS, view: filters.view })}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <ol className="space-y-4">
          {shown.map((q) => {
            const stub = stubs[q.id];
            if (stub) {
              return (
                <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/60 px-4 py-2.5 text-sm">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                    stub.kind === "approved" ? STATUS_CHIP.approved.cls : stub.kind === "binned" ? STATUS_CHIP.binned.cls : STATUS_CHIP.clean.cls)}>
                    {stub.kind === "approved" ? "Approved" : stub.kind === "binned" ? "Binned" : "Restored"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{q.prompt}</span>
                  {stub.kind === "approved" && <Button size="sm" variant="outline" onClick={() => undoApprove(q, stub.was)}>Undo</Button>}
                  {stub.kind === "binned" && <Button size="sm" variant="outline" onClick={() => bin(q, false)}>Undo</Button>}
                  {stub.kind === "restored" && <Button size="sm" variant="outline" onClick={() => bin(q, true)}>Undo</Button>}
                  {errors[q.id] && <p className="w-full text-xs text-danger" role="alert">{errors[q.id]}</p>}
                </li>
              );
            }
            return (
              <li key={q.id}>
                <QuestionCard
                  q={q}
                  topics={topics}
                  saved={!!saved[q.id]}
                  error={errors[q.id]}
                  onApprove={() => approve(q)}
                  onEdit={() => setEditing(q.id)}
                  onBin={() => bin(q, !q.archived)}
                />
              </li>
            );
          })}
        </ol>
      )}

      {visible.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
            Show {Math.min(PAGE, visible.length - limit)} more
          </Button>
        </div>
      )}

      {editingQ && (
        <ReviewEditDialog
          key={editingQ.id}
          question={editingQ}
          topics={topics}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            patchLocal(editingQ.id, patch);
            setSaved((s) => ({ ...s, [editingQ.id]: true }));
            setError(editingQ.id, null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function QuestionCard({
  q, topics, saved, error, onApprove, onEdit, onBin,
}: {
  q: BankQuestion;
  topics: Topic[];
  saved: boolean;
  error?: string;
  onApprove: () => void;
  onEdit: () => void;
  onBin: () => void;
}) {
  const chip = STATUS_CHIP[q.archived ? "binned" : q.review_status];
  const notes = splitReviewNote(q.review_note);
  const flagged = q.review_status === "check" && !q.archived;
  const marks = marksText(q.marks);
  const noCorrect = q.kind === "mcq" && !!q.options?.length && !q.options.some((o) => o.correct);

  return (
    <article
      className={cn("overflow-hidden rounded-xl border bg-card", flagged ? "border-warn/40" : "border-border")}
      aria-label={q.prompt.slice(0, 80)}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] px-4 py-2 text-sm">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", chip.cls)}>{chip.text}</span>
        {saved && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">Saved</span>}
        <span className="font-semibold">{topicPath(q.topic_id, topics)}</span>
        <span className="text-muted-foreground">· {KIND_TEXT[q.kind]}</span>
        <span className="ml-auto font-medium tabular-nums">
          {marks ?? <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn">Marks not set</span>}
        </span>
      </header>

      <div className="space-y-4 p-4">
        {notes.length > 0 && (
          <div className={cn("rounded-lg border px-3 py-2 text-sm",
            flagged ? "border-warn/40 bg-warn/15" : "border-border bg-muted/60 text-muted-foreground")}>
            <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wide", flagged && "text-warn")}>
              {flagged ? "Why it needs a look" : "Note from the import"}
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        <div className="font-semibold">
          <QuestionPrompt
            prompt={q.prompt} images={q.prompt_images} imageUrls={q.imageUrls} quran={q.prompt_quran} variant="screen"
          />
        </div>

        {q.kind === "mcq" && (
          q.options?.length ? (
            <div className="space-y-1">
              {q.select_many && <p className="text-xs text-muted-foreground">Select all that apply</p>}
              <OptionList options={q.options} imageUrls={q.imageUrls} showCorrect variant="screen" />
              {noCorrect && <p className="text-xs text-warn">No option is marked as the right one.</p>}
            </div>
          ) : <p className="text-sm text-warn">Multiple choice, but no options were imported.</p>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Answer / mark scheme</p>
          {hasAnswer(q) ? (
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
              <MixedText text={q.answer ?? ""} />
            </div>
          ) : (
            <p className="text-sm text-danger">No answer yet.</p>
          )}
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Found in</p>
            {q.sources.length ? (
              <ul className="space-y-0.5">
                {q.sources.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted-foreground"> · {SOURCE_KIND[s.kind]}{s.number ? ` · Q ${s.number}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-foreground">No source recorded.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Used in</p>
            {q.used_in.length ? (
              <div className="flex flex-wrap gap-1.5">
                {q.used_in.map((u) => (
                  <span key={u} className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">{u}</span>
                ))}
              </div>
            ) : <p className="text-muted-foreground">Not set in an exam yet.</p>}
          </div>
        </div>

        {error && <p className="text-xs text-danger" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {q.archived ? (
            <Button onClick={onBin}>Restore</Button>
          ) : (
            <>
              {q.review_status !== "approved" && <Button onClick={onApprove}>Approve</Button>}
              <Button variant="outline" onClick={onEdit}>Edit</Button>
              <Button variant="destructive" className="ml-auto" onClick={onBin}>Bin</Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
