"use client";

/**
 * The bank page's browser, by topic: a video series opens to the rules
 * inside it, each rule to its questions. (The builder adds questions through
 * its own step-through drawer, add-drawer.tsx.) Standalone subjects (Seerah,
 * A'daab, …) open straight to their questions. Search, marks, "Not used
 * before" and type narrow the whole tree at once, and the counts follow.
 *
 * A rule's questions are only rendered while it is open: the bank holds
 * hundreds, and nobody reads them all at once.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { filterBank, markValues, topicCounts } from "@/lib/exam-builder/filters";
import { formatMarks } from "@/lib/exam-builder/numbering";
import { groupTopics } from "@/lib/exam-builder/topics";
import type { BankQuestion, QuestionKind, Topic } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { BankQuestionCard } from "./bank-question-card";

export const pill = (on: boolean) =>
  cn(
    "inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on
      ? "border-brand/40 bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground"
      : "border-line bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
  );

function Count({ n }: { n: number }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground tabular-nums">
      {n}
    </span>
  );
}

function Fold({
  id, open, onToggle, summary, children, level,
}: {
  id: string;
  open: boolean;
  onToggle: (id: string, open: boolean) => void;
  summary: ReactNode;
  children: ReactNode;
  level: 1 | 2;
}) {
  return (
    <details open={open} onToggle={(e) => onToggle(id, e.currentTarget.open)} className={level === 1 ? "border-b border-line" : ""}>
      <summary
        className={cn(
          "flex cursor-pointer items-center gap-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          level === 1
            ? "px-3 py-3 text-[0.95rem] font-semibold hover:bg-muted/60"
            : "rounded-md py-2 pr-2 pl-7 text-sm font-medium hover:bg-muted/60",
        )}
      >
        <ChevronRight className="exam-chev size-4 shrink-0 text-muted-foreground transition-transform" aria-hidden />
        {summary}
      </summary>
      {open && children}
    </details>
  );
}

export function BankPanel({
  topics,
  questions,
  reveal = null,
  className,
}: {
  topics: Topic[];
  questions: BankQuestion[];
  /** A topic to open (with its series), e.g. where a just-written question went. */
  reveal?: string | null;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [marks, setMarks] = useState<number[]>([]);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [kind, setKind] = useState<QuestionKind | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // Open the revealed topic when it changes (adjusting state during render,
  // React's pattern for "reset when a prop changes", rather than an effect).
  const [revealed, setRevealed] = useState<string | null>(null);
  if (reveal !== revealed) {
    setRevealed(reveal);
    if (reveal) {
      const parent = topics.find((t) => t.id === reveal)?.parent_id;
      setOpen((s) => new Set([...s, reveal, ...(parent ? [parent] : [])]));
    }
  }

  const groups = useMemo(() => groupTopics(topics), [topics]);
  const allMarks = useMemo(() => markValues(questions), [questions]);
  const filtered = useMemo(
    () => filterBank(questions, { text, marks, unusedOnly, kind }, topics),
    [questions, text, marks, unusedOnly, kind, topics],
  );
  const counts = useMemo(() => topicCounts(filtered, topics), [filtered, topics]);
  const byTopic = useMemo(() => {
    const m = new Map<string, BankQuestion[]>();
    for (const q of filtered) m.set(q.topic_id, [...(m.get(q.topic_id) ?? []), q]);
    return m;
  }, [filtered]);
  const active = !!(text.trim() || marks.length || unusedOnly || kind);

  const toggle = (id: string, isOpen: boolean) =>
    setOpen((s) => {
      if (s.has(id) === isOpen) return s;
      const n = new Set(s);
      if (isOpen) n.add(id); else n.delete(id);
      return n;
    });

  const search = (v: string) => {
    setText(v);
    if (!v.trim()) return;
    // A search opens every series it finds something in; and the rules too
    // when there are few enough hits to read.
    const hits = filterBank(questions, { text: v, marks, unusedOnly, kind }, topics);
    const c = topicCounts(hits, topics);
    const next = new Set<string>();
    for (const g of groups) {
      if (!c[g.topic.id]) continue;
      next.add(g.topic.id);
      if (hits.length <= 30) for (const r of g.children) if (c[r.id]) next.add(r.id);
    }
    setOpen(next);
  };

  const clear = () => {
    setText(""); setMarks([]); setUnusedOnly(false); setKind(null);
  };

  const cards = (list: BankQuestion[]) => (
    <div className="grid gap-2 px-2 pt-1 pb-3">
      {list.map((q) => (
        <BankQuestionCard key={q.id} q={q} />
      ))}
    </div>
  );

  return (
    <div className={cn("exam-tree flex min-h-0 flex-col", className)}>
      <div className="grid gap-3 border-b border-line bg-card p-3">
        <label className="relative block">
          <span className="sr-only">Search the bank</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(e) => search(e.target.value)}
            placeholder="Search questions and answers"
            className="h-9 pl-8"
          />
        </label>
        {allMarks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Marks">
            <span className="mr-1 text-xs text-muted-foreground">Marks</span>
            {allMarks.map((m) => {
              const on = marks.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  className={cn(pill(on), "min-w-8 justify-center px-2.5")}
                  onClick={() => setMarks((xs) => (on ? xs.filter((x) => x !== m) : [...xs, m]))}
                >
                  {formatMarks(m)}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Question type" className="flex flex-wrap gap-1.5">
            {([[null, "All types"], ["mcq", "Multiple choice"], ["short", "Short answer"]] as const).map(([k, label]) => (
              <button key={label} type="button" aria-pressed={kind === k} className={pill(kind === k)} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={unusedOnly} className={pill(unusedOnly)} onClick={() => setUnusedOnly((v) => !v)}>
            Not used before
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
          <span>
            {active ? `${filtered.length} of ${questions.length} questions match` : `${questions.length} questions`}
          </span>
          {active && (
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <X className="size-3" aria-hidden /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No questions match. Try fewer filters or another word.
          </p>
        ) : (
          groups.map((g) => {
            const n = counts[g.topic.id] ?? 0;
            if (!n) return null;
            const isOpen = open.has(g.topic.id);
            return (
              <Fold
                key={g.topic.id}
                id={g.topic.id}
                open={isOpen}
                onToggle={toggle}
                level={1}
                summary={<><span className="min-w-0 flex-1">{g.topic.title}</span><Count n={n} /></>}
              >
                {g.children.length === 0 ? (
                  cards(byTopic.get(g.topic.id) ?? [])
                ) : (
                  <div className="pb-2">
                    {/* questions filed on the series itself, if any */}
                    {(byTopic.get(g.topic.id)?.length ?? 0) > 0 && cards(byTopic.get(g.topic.id)!)}
                    {g.children.map((r) => {
                      const rn = counts[r.id] ?? 0;
                      if (!rn) return null;
                      return (
                        <Fold
                          key={r.id}
                          id={r.id}
                          open={open.has(r.id)}
                          onToggle={toggle}
                          level={2}
                          summary={<><span className="min-w-0 flex-1">{r.title}</span><Count n={rn} /></>}
                        >
                          {cards(byTopic.get(r.id) ?? [])}
                        </Fold>
                      );
                    })}
                  </div>
                )}
              </Fold>
            );
          })
        )}
      </div>
    </div>
  );
}
