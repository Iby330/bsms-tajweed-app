"use client";

/**
 * "Listening to [Name ▾] · [Portion ▾]": the listener screen's title line and
 * its two pickers.
 *
 * - A popover under its button on desktop; a bottom sheet above the tab bar
 *   on phones.
 * - The portion picker is multi-select within one kind (hizb, juz or surah).
 *   There is no Apply: closing it (✕, outside, Esc) saves; an empty
 *   selection keeps the previous one.
 * - Changing either once the session is dirty asks, inside the picker,
 *   before starting over.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bandLimits, formatClock, type BandMinutes } from "@/lib/murajaah/bands";
import { hizbEqOf, PORTIONS, selectionLabel, type PortionKind } from "@/lib/murajaah/portions";
import { cn } from "@/lib/utils";
import { surahMatches, toggleUnit, type Selection } from "./listener-logic";
import type { Reciter } from "./use-listener-session";

type Pick = "who" | "por";
type Pending = { type: "who"; value: Reciter; label: string } | { type: "por"; value: Selection; label: string };

const KINDS: { id: PortionKind; label: string }[] = [
  { id: "hizb", label: "Hizb" }, { id: "juz", label: "Juz" }, { id: "surah", label: "Surah" },
];
const JUZ_NAME: Record<number, string> = { 29: "Tabarak", 30: "Juz ʿAmma" };

const same = (a: Selection | null, b: Selection) =>
  !!a && a.kind === b.kind && a.ns.length === b.ns.length && a.ns.every((n, i) => n === b.ns[i]);

/** "Ideal ≤ 20:00" for a selection. */
export function idealLine(sel: Selection, minutes: BandMinutes): string {
  return `Ideal ≤ ${formatClock(bandLimits(hizbEqOf(sel.kind, sel.ns), minutes).ideal)}`;
}

export function TitleLine({
  people, reciter, sel, dirty, minutes, onPick, onOpenChange,
}: {
  people: Reciter[];
  reciter: Reciter | null;
  sel: Selection | null;
  /** Changing now would throw away time, marks or ticks: confirm first. */
  dirty: boolean;
  minutes: BandMinutes;
  onPick: (p: { reciter: Reciter } | { sel: Selection }) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draftSel, setDraftSel] = useState<Selection>({ kind: "juz", ns: [] });
  const [tab, setTab] = useState<PortionKind>("juz");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const whoBtn = useRef<HTMLButtonElement>(null);
  const porBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (refocus: boolean) => {
    const trigger = pick === "who" ? whoBtn.current : porBtn.current;
    setPick(null);
    setPending(null);
    onOpenChange?.(false);
    if (refocus) trigger?.focus();
  };

  const open = (p: Pick) => {
    if (pick === p) return requestClose();
    if (pick && !requestClose()) return;
    setPick(p);
    setPending(null);
    setQuery("");
    setMsg("");
    const start = sel ?? { kind: "juz" as const, ns: [] };
    setDraftSel({ kind: start.kind, ns: [...start.ns] });
    setTab(start.kind);
    onOpenChange?.(true);
  };

  /** Closing the portion picker saves it. False while a confirm waits for an answer. */
  function requestClose(): boolean {
    if (!pick) return true;
    if (pending) return false;
    if (pick === "por" && draftSel.ns.length && !same(sel, draftSel)) {
      const value = { kind: draftSel.kind, ns: [...draftSel.ns] };
      const label = selectionLabel(value.kind, value.ns);
      if (dirty) {
        setPending({ type: "por", value, label });
        return false;
      }
      close(true);
      onPick({ sel: value });
      return true;
    }
    close(true);
    return true;
  }

  const chooseWho = (p: Reciter) => {
    if (p.id === reciter?.id) return close(true);
    if (dirty) return setPending({ type: "who", value: p, label: p.name });
    close(true);
    onPick({ reciter: p });
  };

  const confirm = () => {
    if (!pending) return;
    const p = pending;
    close(true);
    onPick(p.type === "who" ? { reciter: p.value } : { sel: p.value });
  };

  // Esc and outside clicks close (and so save) the open picker.
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  const keepRef = useRef(() => close(true));
  keepRef.current = () => close(true);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (pendingRef.current) keepRef.current();
      else closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || whoBtn.current?.contains(t) || porBtn.current?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [pick]);

  // Focus the current choice (or the first button) when a picker opens.
  useEffect(() => {
    if (!pick || !panel.current) return;
    const el = panel.current.querySelector<HTMLElement>('[aria-current="true"],[aria-pressed="true"]')
      ?? panel.current.querySelector<HTMLElement>("button");
    el?.focus({ preventScroll: true });
    el?.scrollIntoView?.({ block: "nearest" });
  }, [pick]);

  const toggle = (kind: PortionKind, n: number) => {
    const r = toggleUnit(draftSel, kind, n);
    setDraftSel(r.sel);
    setMsg(r.msg);
  };

  const trigger = (p: Pick, label: string, ref: React.RefObject<HTMLButtonElement | null>, title?: string) => (
    <button
      ref={ref}
      type="button"
      onClick={() => open(p)}
      aria-haspopup="dialog"
      aria-expanded={pick === p}
      aria-controls={pick === p ? `${id}-pop` : undefined}
      title={title}
      className={cn(
        "inline-flex h-8 max-w-[min(340px,60vw)] items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-sm font-semibold text-foreground transition-colors hover:border-brand pointer-coarse:h-11",
        pick === p && "border-brand bg-muted",
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );

  const head = (text: string) => (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{text}</h2>
      <button
        type="button"
        onClick={() => (pending ? close(true) : requestClose())}
        aria-label={pick === "por" ? "Close and save" : "Close"}
        className="-m-1.5 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted max-md:size-11"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );

  let body: React.ReactNode = null;
  if (pick && pending) {
    body = (
      <>
        {head(pick === "who" ? "Listening to" : "Portion")}
        <div role="alert" className="grid gap-2.5 rounded-xl border border-line bg-muted p-3">
          <p className="text-sm">Start over with {pending.label}? This clears the time, mistakes and checkpoints.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={confirm} autoFocus>Start over</Button>
            <Button size="lg" variant="outline" onClick={() => close(true)}>Keep current</Button>
          </div>
        </div>
      </>
    );
  } else if (pick === "who") {
    body = (
      <>
        {head("Listening to")}
        {people.length ? (
          <div className="flex flex-col gap-0.5">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => chooseWho(p)}
                aria-current={p.id === reciter?.id ? "true" : undefined}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-muted max-md:min-h-11",
                  p.id === reciter?.id && "bg-muted font-semibold",
                )}
              >
                <span>{p.name}</span>
                {p.id === reciter?.id && <Check className="size-4 text-brand" aria-hidden />}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No one else is in your class yet.</p>
        )}
        <p className="text-xs text-muted-foreground">Your classmates in Esteemed Ustadhs.</p>
      </>
    );
  } else if (pick === "por") {
    const note = msg
      || (draftSel.ns.length && draftSel.kind !== tab ? `Picking a ${tab} clears your ${draftSel.kind} selection.` : "")
      || "Tap to add, tap again to remove. Closing saves.";
    const isOn = (kind: PortionKind, n: number) => draftSel.kind === kind && draftSel.ns.includes(n);
    const selected = "border-transparent bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] font-semibold";
    body = (
      <>
        {head("Portion · pick one or more")}
        <div role="tablist" aria-label="Portion kind" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={tab === k.id}
              onClick={() => { setTab(k.id); setMsg(""); }}
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground max-md:h-10",
                tab === k.id && "bg-card text-foreground ring-1 ring-line",
              )}
            >
              {k.label}
              {draftSel.kind === k.id && draftSel.ns.length > 0 && (
                <span className="rounded-full bg-brand/15 px-1.5 text-[11px] text-brand tabular-nums">{draftSel.ns.length}</span>
              )}
            </button>
          ))}
        </div>
        <p className="min-h-[1.3em] text-xs text-muted-foreground" aria-live="polite">{note}</p>
        {tab === "surah" && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const first = panel.current?.querySelector<HTMLButtonElement>("[data-unit]");
              if (first) { e.preventDefault(); first.click(); }
            }}
            placeholder="Search name or number"
            aria-label="Search surahs by English name, Arabic name or number"
            autoComplete="off"
            className="h-8 w-full rounded-lg border border-line bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-md:h-11 max-md:text-base"
          />
        )}
        <div role="tabpanel" className="min-h-[120px] overflow-auto p-0.5 md:max-h-[min(340px,calc(100dvh-300px))] max-md:min-h-0 max-md:flex-1">
          {tab !== "surah" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1">
              {(tab === "hizb" ? PORTIONS.hizbs : PORTIONS.juzs).map((x) => {
                const on = isOn(tab, x.n);
                const extra = tab === "juz" ? JUZ_NAME[x.n] : undefined;
                return (
                  <button
                    key={x.n}
                    type="button"
                    data-unit
                    onClick={() => toggle(tab, x.n)}
                    aria-pressed={on}
                    aria-label={`${tab === "hizb" ? "Hizb" : "Juz"} ${x.n}, starts at ${x.label}${extra ? ` (${extra})` : ""}`}
                    className={cn(
                      "relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border border-line bg-card px-1 py-1 hover:border-brand",
                      on && selected,
                    )}
                  >
                    {on && <Check className="absolute top-1 right-1 size-3 text-brand" aria-hidden />}
                    <b className="text-sm leading-tight tabular-nums">{x.n}</b>
                    <small className="max-w-full truncate text-[10px] leading-tight text-muted-foreground">{x.label}</small>
                    {extra && <small className="max-w-full truncate text-[10px] font-semibold leading-tight text-brand">{extra}</small>}
                  </button>
                );
              })}
            </div>
          ) : (
            <SurahList query={query} isOn={(n) => isOn("surah", n)} onToggle={(n) => toggle("surah", n)} selectedClass={selected} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 border-t border-line pt-2.5 text-[13px] text-muted-foreground">
          {draftSel.ns.length ? (
            <>
              <span className="min-w-0 truncate">
                <b className="text-foreground">{selectionLabel(draftSel.kind, draftSel.ns)}</b>
                {" · "}{idealLine(draftSel, minutes)}
              </span>
              <button
                type="button"
                onClick={() => { setDraftSel({ ...draftSel, ns: [] }); setMsg(""); }}
                className="h-8 shrink-0 rounded-md px-1.5 text-[13px] font-semibold text-brand hover:underline"
              >
                Clear
              </button>
            </>
          ) : (
            <span>{sel ? `Nothing selected. Closing keeps ${selectionLabel(sel.kind, sel.ns)}.` : "Nothing selected yet."}</span>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="relative">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        <span>Listening to</span>
        {trigger("who", reciter?.name ?? "Choose a classmate", whoBtn, reciter ? `Listening to ${reciter.name}` : undefined)}
        <span aria-hidden>·</span>
        {trigger("por", sel ? selectionLabel(sel.kind, sel.ns) : "Choose a portion", porBtn, sel ? selectionLabel(sel.kind, sel.ns) : undefined)}
      </p>
      {pick && (
        <>
          <div
            aria-hidden
            className="fixed inset-x-0 top-0 bottom-[var(--chrome-bottom,0px)] z-[39] bg-sidebar/45 md:hidden"
          />
          <div
            ref={panel}
            id={`${id}-pop`}
            role="dialog"
            aria-label={pick === "who" ? "Choose who you are listening to" : "Choose the portion"}
            className={cn(
              "z-40 flex flex-col gap-2.5 border border-line bg-card p-3 text-foreground shadow-[0_12px_32px_color-mix(in_oklab,var(--sidebar)_28%,transparent)]",
              "md:absolute md:top-full md:mt-1.5 md:rounded-xl",
              pick === "por" ? "md:left-0 md:w-[min(460px,100%)]" : "md:left-0 md:w-[min(300px,100%)]",
              "max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--chrome-bottom,0px)] max-md:rounded-t-2xl max-md:border-b-0 max-md:px-4 max-md:shadow-none",
              "max-md:max-h-[calc(100dvh-var(--chrome-top,0px)-var(--chrome-bottom,0px)-1rem)]",
              pick === "por" && "max-md:h-[calc(100dvh-var(--chrome-top,0px)-var(--chrome-bottom,0px)-1rem)]",
            )}
          >
            {body}
          </div>
        </>
      )}
    </div>
  );
}

function SurahList({
  query, isOn, onToggle, selectedClass,
}: {
  query: string;
  isOn: (n: number) => boolean;
  onToggle: (n: number) => void;
  selectedClass: string;
}) {
  const list = PORTIONS.surahs.filter((s) => surahMatches(s, query));
  if (!list.length) return <p className="text-xs text-muted-foreground">No surah matches “{query}”.</p>;
  return (
    <div className="flex flex-col gap-0.5">
      {list.map((s) => {
        const on = isOn(s.n);
        return (
          <button
            key={s.n}
            type="button"
            data-unit
            onClick={() => onToggle(s.n)}
            aria-pressed={on}
            aria-label={`${s.n}. ${s.en}`}
            className={cn(
              "grid min-h-10 w-full grid-cols-[28px_minmax(0,1fr)_auto_64px_16px] items-center gap-2 rounded-lg border border-transparent px-2 text-left text-sm hover:bg-muted max-md:min-h-11 max-[359px]:grid-cols-[24px_minmax(0,1fr)_auto_16px]",
              on && selectedClass,
            )}
          >
            <span className="text-xs text-muted-foreground tabular-nums">{s.n}</span>
            <span className="truncate font-semibold">{s.en}</span>
            <span lang="ar" dir="rtl" className="ar-ui text-base">{s.ar}</span>
            <span className="text-right text-[11.5px] text-muted-foreground tabular-nums max-[359px]:hidden">
              {s.pages[0] === s.pages[1] ? `p${s.pages[0]}` : `p${s.pages[0]}–${s.pages[1]}`}
            </span>
            <span className="leading-none">{on && <Check className="size-3.5 text-brand" aria-hidden />}</span>
          </button>
        );
      })}
    </div>
  );
}
