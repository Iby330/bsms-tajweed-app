"use client";

/**
 * "Add a question": the step-through drawer a section's button opens. Three
 * steps with a trail at the top (Series › Rule › Questions), a count on every
 * row, and the section's likely question type picked to start with, with
 * "Show all types" beside it. A series with no rules (Seerah, Matn, …) goes
 * straight to its questions. Searching skips the steps and lists matches from
 * the whole bank.
 *
 * On a computer it is a panel down the left edge, over the app's own menu,
 * and the paper moves right to clear it, so the marks column stays in view.
 * On a phone or tablet it fills the screen, one step at a time, with a back
 * arrow at the top and the count and Done at the bottom.
 *
 * It holds no state of its own: the workspace keeps a view per section, so
 * reopening a section returns to where it was left.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft, ChevronRight, FilePlus2, PenLine, Search, SlidersHorizontal, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_RULES, START, drawerLevel, kindWord, nextRule, placeTopicIds, sectionShortName, stepUp,
  type DrawerPlace, type DrawerView,
} from "@/lib/exam-builder/drawer";
import { filterBank, markValues, topicCounts } from "@/lib/exam-builder/filters";
import { formatMarks } from "@/lib/exam-builder/numbering";
import { groupTopics, topicPath } from "@/lib/exam-builder/topics";
import type { BankQuestion, QuestionKind, Section, Topic } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { BankQuestionCard } from "./bank-question-card";
import { pill } from "./bank-panel";

/** Search results come in pages: the bank holds hundreds. */
const PAGE = 30;

const linkCls =
  "cursor-pointer rounded-sm font-semibold text-brand underline underline-offset-2 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function StepRow({
  title, sub, onPaper, disabled, onClick, dashed = false,
}: {
  title: string;
  sub: string;
  onPaper?: number;
  disabled?: boolean;
  onClick: () => void;
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-12 lg:px-3.5 lg:py-2",
        dashed ? "border-dashed border-brand/40 bg-[color-mix(in_oklab,var(--brand)_10%,var(--card))]" : "border-line",
        disabled ? "cursor-default opacity-50" : "cursor-pointer hover:border-brand/60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.95rem] font-semibold lg:text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
      {!!onPaper && (
        <span className="shrink-0 rounded-full bg-tertiary-surface px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap text-tertiary-foreground">
          {onPaper} on paper
        </span>
      )}
      {!disabled && <ChevronRight className="size-5 shrink-0 text-brand" aria-hidden />}
    </button>
  );
}

export function AddDrawer({
  section, view, onView, guess, resumed, added, topics, questions, onPaper, paperMarks, locked,
  onAdd, onWriteNew, onAddBlank, onClose,
}: {
  section: Section;
  view: DrawerView;
  onView: (patch: Partial<DrawerView>) => void;
  /** The type the section's questions (or title) suggest; null = no guess. */
  guess: QuestionKind | null;
  /** Reopened at a remembered place. */
  resumed: boolean;
  /** Questions added since it opened. */
  added: number;
  topics: Topic[];
  questions: BankQuestion[];
  /** Bank question ids already on the paper. */
  onPaper: Set<string>;
  paperMarks: number;
  locked: boolean;
  onAdd: (q: BankQuestion) => void;
  /** "Write a new question", starting on this type and topic. */
  onWriteNew: (kind: QuestionKind, topicId: string) => void;
  onAddBlank: (kind: QuestionKind) => void;
  onClose: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupTopics(topics), [topics]);
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const allMarks = useMemo(() => markValues(questions), [questions]);
  const { place, kind, marks, unusedOnly, text } = view;
  const searching = text.trim().length > 0;
  const level = drawerLevel(place, groups);
  const group = place.series ? groups.find((g) => g.topic.id === place.series) ?? null : null;
  const short = sectionShortName(section.title);
  const word = kindWord(kind);

  // Every filter but the place, so each row can count what it would show.
  const narrowed = useMemo(
    () => filterBank(questions, { kind, marks, unusedOnly }, topics),
    [questions, kind, marks, unusedOnly, topics],
  );
  const counts = useMemo(() => topicCounts(narrowed, topics), [narrowed, topics]);
  const paperCounts = useMemo(
    () => topicCounts(questions.filter((q) => onPaper.has(q.id)), topics),
    [questions, onPaper, topics],
  );
  const list = useMemo(() => {
    if (searching) return filterBank(narrowed, { text }, topics);
    if (level !== "questions") return [];
    return filterBank(narrowed, { topicIds: placeTopicIds(place, groups) }, topics);
  }, [searching, narrowed, text, topics, level, place, groups]);
  const next = nextRule(place, groups, counts);

  // Into the drawer when it opens or changes section, so the keyboard follows.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [section.id]);
  // A new step starts at its top.
  const where = `${place.series}|${place.rule}|${searching}`;
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [where]);

  const go = (p: DrawerPlace) => {
    setShown(PAGE);
    onView({ place: p });
  };
  const up = () => {
    if (searching) { onView({ text: "" }); return; }
    const p = stepUp(place, groups);
    if (p) go(p); else onClose();
  };
  const activeFilters = marks.length + (unusedOnly ? 1 : 0) + (kind && kind !== guess ? 1 : 0);

  // The topic a new question starts on: the rule (or one-level subject) on screen.
  const writeTopic =
    level === "questions" && !searching && group
      ? group.children.length === 0 ? group.topic.id : place.rule !== ALL_RULES ? place.rule ?? "" : ""
      : "";
  const writeKind: QuestionKind = kind ?? guess ?? "short";

  const typeNote = (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {kind ? (
        <>
          Showing <b className="font-semibold text-foreground">{word}</b> only
          {kind === guess ? `, to match ${short}` : ""}.{" "}
          <button type="button" className={linkCls} onClick={() => onView({ kind: null })}>Show all types</button>
        </>
      ) : (
        <>
          Showing <b className="font-semibold text-foreground">all types</b>.
          {guess && (
            <>
              {" "}
              <button type="button" className={linkCls} onClick={() => onView({ kind: guess })}>
                Only {kindWord(guess)}, to match {short}
              </button>
            </>
          )}
        </>
      )}
    </p>
  );

  const trail = (
    <nav aria-label="Where you are" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-line bg-background/60 px-3 py-1.5 text-[0.8rem]">
      {place.series ? (
        <button type="button" className={linkCls} onClick={() => go(START)}>All series</button>
      ) : (
        <b className="font-semibold" aria-current="step">All series</b>
      )}
      {group && (
        <>
          <span className="text-muted-foreground" aria-hidden>›</span>
          {level === "questions" && group.children.length > 0 ? (
            <button type="button" className={linkCls} onClick={() => go({ series: group.topic.id, rule: null })}>
              {group.topic.title}
            </button>
          ) : (
            <b className="font-semibold" aria-current="step">{group.topic.title}</b>
          )}
          {level === "questions" && group.children.length > 0 && (
            <>
              <span className="text-muted-foreground" aria-hidden>›</span>
              <b className="font-semibold" aria-current="step">
                {place.rule === ALL_RULES ? "All rules" : byId.get(place.rule ?? "")?.title}
              </b>
            </>
          )}
        </>
      )}
    </nav>
  );

  const filters = (
    <div id="exam-add-filters" className="grid gap-2.5 rounded-lg border border-line bg-background/60 p-3">
      <div role="group" aria-label="Question type" className="flex flex-wrap gap-1.5">
        {([[null, "All types"], ["mcq", "Multiple choice"], ["short", "Short answer"]] as const).map(([k, label]) => (
          <button key={label} type="button" aria-pressed={kind === k} className={pill(kind === k)} onClick={() => onView({ kind: k })}>
            {label}
          </button>
        ))}
      </div>
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
                onClick={() => onView({ marks: on ? marks.filter((x) => x !== m) : [...marks, m] })}
              >
                {formatMarks(m)}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" aria-pressed={unusedOnly} className={pill(unusedOnly)} onClick={() => onView({ unusedOnly: !unusedOnly })}>
          Not used before
        </button>
        {(marks.length > 0 || unusedOnly) && (
          <button type="button" className={cn(linkCls, "text-xs")} onClick={() => onView({ marks: [], unusedOnly: false })}>
            Clear marks and not used
          </button>
        )}
      </div>
    </div>
  );

  const cards = (qs: BankQuestion[], label: (q: BankQuestion) => string | undefined) => (
    <div className="grid gap-2.5">
      {qs.map((q) => (
        <BankQuestionCard
          key={q.id}
          q={q}
          added={onPaper.has(q.id)}
          onAdd={() => onAdd(q)}
          addLabel={`Add to ${short}`}
          locked={locked}
          topicLabel={label(q)}
        />
      ))}
    </div>
  );

  const nothing = (what: string) => (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center text-sm text-muted-foreground">
      <p>{what}</p>
      {kind && <button type="button" className={linkCls} onClick={() => onView({ kind: null })}>Show all types</button>}
      {!kind && (marks.length > 0 || unusedOnly) && (
        <button type="button" className={linkCls} onClick={() => onView({ marks: [], unusedOnly: false })}>Clear the filters</button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (searching) {
    body = (
      <>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {list.length === 0 ? "" : `${list.length} ${list.length === 1 ? "question matches" : "questions match"} across the bank.`}{" "}
          <button type="button" className={linkCls} onClick={() => onView({ text: "" })}>Back to the steps</button>
        </p>
        {list.length === 0
          ? nothing(`No ${kind ? word : "questions"} match “${text.trim()}”.`)
          : cards(list.slice(0, shown), (q) => topicPath(q.topic_id, topics))}
        {list.length > shown && (
          <Button variant="outline" className="h-11 w-full" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, list.length - shown)} more
          </Button>
        )}
      </>
    );
  } else if (level === "series") {
    const video = groups.filter((g) => g.children.length > 0);
    const other = groups.filter((g) => g.children.length === 0);
    const row = (g: (typeof groups)[number]) => {
      const n = counts[g.topic.id] ?? 0;
      const rules = g.children.length;
      return (
        <StepRow
          key={g.topic.id}
          title={g.topic.title}
          sub={`${n ? `${n} ${word}` : `No ${word}`}${rules ? ` · ${rules} rules` : ""}`}
          onPaper={paperCounts[g.topic.id]}
          disabled={!n}
          onClick={() => go({ series: g.topic.id, rule: null })}
        />
      );
    };
    body = (
      <>
        <h3 className="px-0.5 text-[0.7rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">Video series</h3>
        {video.map(row)}
        {other.length > 0 && (
          <h3 className="mt-2 px-0.5 text-[0.7rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">Other subjects</h3>
        )}
        {other.map(row)}
      </>
    );
  } else if (level === "rules" && group) {
    const n = counts[group.topic.id] ?? 0;
    body = (
      <>
        <StepRow
          dashed
          title={`All of ${group.topic.title}`}
          sub={n ? `${n} ${word}` : `No ${word}`}
          disabled={!n}
          onClick={() => go({ series: group.topic.id, rule: ALL_RULES })}
        />
        {group.children.map((r) => {
          const rn = counts[r.id] ?? 0;
          return (
            <StepRow
              key={r.id}
              title={r.title}
              sub={rn ? `${rn} ${word}` : `No ${word}`}
              onPaper={paperCounts[r.id]}
              disabled={!rn}
              onClick={() => go({ series: group.topic.id, rule: r.id })}
            />
          );
        })}
      </>
    );
  } else if (group) {
    const nextTitle = next ? byId.get(next)?.title : null;
    body = (
      <>
        {list.length === 0
          ? nothing(`No ${word} here${marks.length || unusedOnly ? " with these filters" : ""}.`)
          : cards(list, (q) => (place.rule === ALL_RULES && q.topic_id !== group.topic.id ? byId.get(q.topic_id)?.title : undefined))}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <Button variant="outline" className="h-11 lg:h-9" onClick={() => go(group.children.length ? { series: group.topic.id, rule: null } : START)}>
            <ChevronLeft aria-hidden /> {group.children.length ? `All ${group.topic.title} rules` : "All series"}
          </Button>
          {nextTitle && (
            <Button variant="outline" className="h-11 border-brand/50 text-brand lg:h-9" onClick={() => go({ series: group.topic.id, rule: next })}>
              Next rule: {nextTitle} <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
      </>
    );
  }

  const status = added > 0
    ? <><b className="font-semibold text-ok">{added} added</b> to {short}.</>
    : <>Questions go to the end of {short}.</>;

  return createPortal(
    <aside
      aria-labelledby="exam-add-title"
      className={cn(
        "exam-add fixed inset-0 z-50 flex flex-col bg-background text-foreground",
        "lg:inset-y-0 lg:right-auto lg:z-40 lg:w-[var(--exam-drawer-w)] lg:border-r lg:border-line lg:bg-card lg:shadow-[10px_0_30px_rgb(0_0_60/0.14)]",
      )}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        // Escape in a search with words in it clears the words first.
        if (searching && (e.target as HTMLElement).getAttribute("type") === "search") return;
        e.preventDefault();
        onClose();
      }}
    >
      <div className="grid gap-2.5 border-b border-line bg-card px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-lg" className="-ml-2 size-11 lg:hidden" onClick={up} aria-label={level === "series" && !searching ? "Back to the paper" : "Back one step"}>
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <h2 id="exam-add-title" ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 text-[0.95rem] leading-snug font-bold outline-none">
            <span className="text-muted-foreground">Add to </span>{section.title}
          </h2>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums lg:hidden">
            {formatMarks(paperMarks)} marks
          </span>
          <Button variant="ghost" size="icon-sm" className="max-lg:hidden" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X aria-hidden />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search every question in the bank</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={text}
              onChange={(e) => { setShown(PAGE); onView({ text: e.target.value }); }}
              placeholder="Search all questions"
              className="h-10 pl-8 lg:h-9"
            />
          </label>
          <Button
            variant="outline"
            className="h-10 shrink-0 lg:h-9"
            aria-expanded={filtersOpen}
            aria-controls="exam-add-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal aria-hidden /> Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-brand/15 px-1.5 text-[0.7rem] font-semibold text-brand tabular-nums">{activeFilters}</span>
            )}
          </Button>
        </div>
        {filtersOpen && filters}
        {!searching && trail}
        {resumed && (
          <p className="rounded-lg bg-ok/15 px-3 py-1.5 text-xs font-semibold text-ok" role="status">
            Opened where you left off.
          </p>
        )}
        {typeNote}
      </div>

      <div ref={listRef} className="exam-tree flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain bg-background p-3 lg:p-3.5">
        {!locked && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
            <span className="mr-1 text-muted-foreground">Not in the bank?</span>
            <Button variant="outline" size="sm" className="h-9 px-2.5 text-xs lg:h-7" onClick={() => onWriteNew(writeKind, writeTopic)}>
              <PenLine aria-hidden /> Write a new question
            </Button>
            <Button variant="ghost" size="sm" className="h-9 px-2.5 text-xs lg:h-7" onClick={() => onAddBlank(writeKind)}>
              <FilePlus2 aria-hidden /> Add a blank {kindWord(writeKind)} question
            </Button>
          </div>
        )}
        {body}
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_14px_rgb(0_0_60/0.06)]">
        <p className="min-w-0 flex-1 text-sm leading-snug" aria-live="polite">
          {status}
          <span className="block text-xs text-muted-foreground lg:hidden">Paper: {formatMarks(paperMarks)} marks</span>
          {added > 0 && <span className="text-xs text-muted-foreground max-lg:hidden"> Keep going, or press Done.</span>}
        </p>
        <Button className="h-12 min-w-24 px-5 text-base lg:h-9 lg:min-w-0 lg:text-sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </aside>,
    document.body,
  );
}
