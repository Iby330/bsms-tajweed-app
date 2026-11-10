"use client";

/**
 * The listener's controls, design C "Thumb rail". One set of controls, laid
 * out two ways:
 * - md and up: a rail beside the mushaf, sticky under the top chrome: the
 *   timer card and band bar, Start/Pause and Finish, the checkpoint list,
 *   the target, and Undo + Mistake +1.
 * - phones: a bar fixed just above the app's tab bar (at the shell's
 *   measured --chrome-bottom), in three rows: time + band, Start/Pause,
 *   Finish; checkpoint chips and + Add; Undo and a wide Mistake +1.
 * Left-handed mirrors both.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BAND_LABEL, BAND_TONE, bandOf, formatClock, type Band, type BandMinutes } from "@/lib/murajaah/bands";
import { clockPhase, type ClockFields } from "@/lib/murajaah/clock";
import { cn } from "@/lib/utils";
import { bandBar, limitLine, timeHint, type CheckpointRow, type Selection } from "./listener-logic";
import { idealLine } from "./title-line";

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd aria-hidden className="rounded-[3px] border border-current px-[3px] py-[1px] font-sans text-[9.5px] font-bold leading-none opacity-65 max-md:hidden pointer-coarse:hidden">
    {children}
  </kbd>
);

export function BandPill({ band, children, className }: { band: Band | null; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
      band ? BAND_TONE[band].pill : "bg-muted text-foreground",
      className,
    )}>
      {children}
    </span>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** How long Finish waits for its second tap. */
const ARM_MS = 3000;

export function SessionControls({
  ready, clock, elapsed, sel, hizbEq, minutes, limit, teacherName, rows, mistakes, lastMarkLabel, lefty,
  onStartPause, onFinish, onTick, onUntick, onAddCheckpoint, onUndo, onPlus,
}: {
  /** A draft exists (its id may still be on its way). */
  ready: boolean;
  clock: ClockFields;
  elapsed: number;
  sel: Selection | null;
  hizbEq: number;
  minutes: BandMinutes;
  limit: number | null;
  teacherName: string;
  rows: CheckpointRow[];
  mistakes: number;
  lastMarkLabel: string | null;
  lefty: boolean;
  onStartPause: () => void;
  onFinish: () => void;
  onTick: () => void;
  onUntick: (id: string) => void;
  onAddCheckpoint: () => void;
  onUndo: () => void;
  onPlus: (fromKeyboardClick: boolean) => void;
}) {
  const phase = clockPhase(clock);
  const started = phase !== "idle";
  const band: Band | null = started ? bandOf(elapsed, hizbEq, minutes) : null;
  const bar = bandBar(elapsed, hizbEq, minutes);
  const done = rows.filter((r) => r.state === "done" && r.kind === "auto").length;
  const autoCount = rows.filter((r) => r.kind === "auto").length;
  const over = limit !== null && mistakes > limit;

  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  const finish = () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    onFinish();
  };

  // Keep the next checkpoint in view as the list moves on.
  const list = useRef<HTMLDivElement>(null);
  const nextOrd = rows.find((r) => r.state === "next")?.ord;
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>("[data-next]");
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [nextOrd, rows.length]);

  const startLabel = phase === "idle" ? "Start" : phase === "running" ? "Pause" : "Resume";
  const status = !started ? "Not started" : `${BAND_LABEL[band!]}${phase === "paused" ? " · paused" : ""}`;
  const timerTone = band ? BAND_TONE[band].pill : "bg-muted text-foreground";

  return (
    <aside
      aria-label="Session controls"
      className={cn(
        // desktop rail
        "flex flex-col gap-3 rounded-xl border border-line bg-card p-4",
        "md:sticky md:top-[calc(var(--chrome-top,0px)+1rem)] md:max-h-[calc(100dvh-var(--chrome-top,0px)-var(--chrome-bottom,0px)-2rem)] md:self-start md:overflow-y-auto",
        // phone bar
        "max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--chrome-bottom,0px)] max-md:z-30 max-md:grid max-md:gap-x-2 max-md:gap-y-1.5 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:px-4 max-md:py-2",
        lefty
          ? "max-md:grid-cols-[auto_minmax(0,1fr)] max-md:[grid-template-areas:'run_timer'_'cps_cps'_'mist_mist']"
          : "max-md:grid-cols-[minmax(0,1fr)_auto] max-md:[grid-template-areas:'timer_run'_'cps_cps'_'mist_mist']",
      )}
    >
      {/* timer */}
      <div className="min-w-0 [grid-area:timer]">
        <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground max-md:hidden">
          <span>Timer</span>
          {sel && <span className="normal-case tracking-normal">{idealLine(sel, minutes)}</span>}
        </div>
        <div className={cn("mt-1.5 rounded-lg px-3 py-2 max-md:mt-0 max-md:flex max-md:min-h-11 max-md:items-center max-md:gap-2 max-md:py-1", timerTone)}>
          <div className="flex justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.06em] max-md:flex-col max-md:gap-0 max-md:text-[10.5px] max-md:min-w-0">
            <span className="max-md:hidden">Time</span>
            <span className="truncate">{status}</span>
            {sel && <span className="truncate font-semibold normal-case tracking-normal md:hidden">{idealLine(sel, minutes)}</span>}
          </div>
          <div role="timer" aria-label="Elapsed time" className="my-0.5 text-[2rem] leading-tight font-bold tabular-nums max-md:order-first max-md:my-0 max-md:text-2xl">
            {formatClock(elapsed)}
          </div>
          <p className="min-h-[1.4em] text-[12.5px] max-md:hidden">
            {started ? timeHint(elapsed, hizbEq, minutes) : ready ? "Press Start when the reciter begins" : "Choose who and what to begin"}
          </p>
        </div>
        <div className="relative mt-2.5 flex h-1.5 gap-0.5 max-md:hidden" aria-hidden>
          {(["ideal", "good", "acceptable", "slow"] as const).map((b, i) => (
            <i key={b} className="rounded-sm" style={{ width: `${bar.widths[i]}%`, background: BAND_TONE[b].fill }} />
          ))}
          <span className="absolute -top-1 -bottom-1 -ml-px w-0.5 rounded-sm bg-foreground" style={{ left: `${bar.markerPct}%` }} />
        </div>
        <div className="mt-1 flex text-[10.5px] text-muted-foreground tabular-nums max-md:hidden" aria-hidden>
          {bar.ticks.map((t, i) => (
            <span key={t + i} className="text-right" style={{ width: `${bar.widths[i]}%` }}>{t}</span>
          ))}
        </div>
      </div>

      {/* start / finish */}
      <div className="grid grid-cols-2 gap-2 [grid-area:run] max-md:flex max-md:gap-1.5">
        <Button
          variant="outline"
          size="lg"
          className="max-md:h-11 max-md:px-3"
          disabled={!ready || phase === "finished"}
          onClick={onStartPause}
          aria-keyshortcuts="P"
        >
          {startLabel} <Kbd>P</Kbd>
        </Button>
        <Button
          variant={armed ? "destructive" : "outline"}
          size="lg"
          className="max-md:h-11 max-md:px-3"
          disabled={!ready || !started || phase === "finished"}
          onClick={finish}
        >
          {armed ? "Tap again" : "Finish"}
        </Button>
      </div>

      {/* checkpoints */}
      <div className="flex min-h-0 flex-col gap-2 [grid-area:cps]">
        <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground max-md:hidden">
          <span>Checkpoints</span>
          <span>{autoCount ? <>{done} of {autoCount} · tick next <Kbd>N</Kbd></> : "none for one surah"}</span>
        </div>
        <div className={cn("flex min-h-0 flex-col gap-2 max-md:flex-row max-md:gap-1.5", lefty && "max-md:flex-row-reverse")}>
          <div
            ref={list}
            className="flex min-h-0 flex-col gap-1.5 overflow-auto p-0.5 max-md:flex-1 max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden max-md:[scrollbar-width:none]"
          >
            {!rows.length && (
              <p className="px-0.5 py-2 text-[12.5px] text-muted-foreground max-md:py-0 max-md:text-xs max-md:self-center">
                No automatic checkpoints for one surah. Add your own if you need a split.
              </p>
            )}
            {rows.map((r) => (
              <CheckpointButton
                key={r.id ?? `auto-${r.ord}`}
                row={r}
                started={started && phase !== "finished"}
                onTick={onTick}
                onUntick={onUntick}
              />
            ))}
          </div>
          <Button
            variant="outline"
            className="h-9 shrink-0 border-dashed bg-transparent max-md:h-11 max-md:flex-col max-md:gap-0 max-md:px-2 max-md:text-xs max-md:leading-tight"
            disabled={!ready || !started || phase === "finished"}
            onClick={onAddCheckpoint}
            aria-label="Add checkpoint"
            aria-keyshortcuts="C"
          >
            <span>+</span><span className="max-md:hidden"> Add checkpoint</span><span className="md:hidden">Add</span> <Kbd>C</Kbd>
          </Button>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground max-md:hidden">
          Ticking a checkpoint records its time and the mistakes in it.
        </p>
      </div>

      {/* target + mistakes */}
      <div className="flex flex-col gap-2 [grid-area:mist]">
        <p className="text-[12.5px] text-muted-foreground max-md:hidden">
          {limit !== null
            ? <>Target: <b className="text-foreground">{limitLine(limit)}</b> · set by {teacherName}</>
            : <>Target: set by {teacherName}</>}
        </p>
        <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground max-md:hidden">
          <span>
            Mistakes <b className="text-sm text-foreground tabular-nums">{mistakes}</b>
            {" · "}{lastMarkLabel ? `last: ${lastMarkLabel}` : "nothing to undo"}
          </span>
          {limit !== null && (
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", over ? "bg-danger/15 text-danger" : "bg-muted text-foreground")}>
              {over ? "over target" : `within ${limit}`}
            </span>
          )}
        </div>
        <div className={cn("grid items-center gap-2 grid-cols-[auto_minmax(0,1fr)] max-md:grid-cols-[76px_minmax(0,1fr)]", lefty && "grid-cols-[minmax(0,1fr)_auto] max-md:grid-cols-[minmax(0,1fr)_76px]")}>
          <Button
            variant="outline"
            size="lg"
            className={cn("max-md:h-11", lefty && "order-2")}
            disabled={!ready || phase === "finished" || mistakes === 0}
            onClick={onUndo}
            title={lastMarkLabel ? `Undo (last: ${lastMarkLabel})` : "Undo"}
            aria-keyshortcuts="Z"
          >
            Undo <Kbd>Z</Kbd>
          </Button>
          <Button
            size="lg"
            className="h-11 w-full gap-2 text-base font-semibold max-md:h-12"
            disabled={!ready || phase === "finished"}
            onClick={(e) => onPlus(e.detail === 0)}
            aria-keyshortcuts="Space M"
            aria-label={`Mistake +1 (${mistakes} so far)`}
          >
            <span className="text-lg font-bold">+1</span>
            <span>Mistake</span>
            <Kbd>Space</Kbd>
            <span className={cn(
              "rounded-md border px-1.5 py-0.5 text-[13px] font-bold tabular-nums",
              over ? "border-transparent bg-danger/15 text-danger" : "border-current/40",
            )}>
              {mistakes}
            </span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function CheckpointButton({
  row, started, onTick, onUntick,
}: {
  row: CheckpointRow;
  started: boolean;
  onTick: () => void;
  onUntick: (id: string) => void;
}) {
  const r = row;
  const done = r.state === "done";
  const next = r.state === "next";
  const disabled = done ? !r.canUntick || !started : next ? !started : true;
  const label = done
    ? `${r.label}, ${formatClock(r.splitMs ?? 0)}${r.band ? `, ${BAND_LABEL[r.band]}` : ""}, ${plural(r.mistakes, "mistake")}${r.canUntick ? `. ${r.kind === "added" ? "Activate to remove" : "Activate to untick"}` : ""}`
    : next ? `Tick ${r.label} when the reciter finishes it` : r.label;

  return (
    <button
      type="button"
      data-next={next ? "" : undefined}
      disabled={disabled}
      onClick={() => (done ? r.id && onUntick(r.id) : onTick())}
      aria-label={label}
      className={cn(
        "grid w-full flex-none grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1 text-left min-h-11 disabled:cursor-default",
        next && "border-brand ring-1 ring-brand ring-inset",
        r.state === "pending" && "opacity-60",
        r.kind === "added" && "border-dashed",
        // phone chips
        "max-md:w-auto max-md:min-w-14 max-md:max-w-[120px] max-md:flex-[1_0_56px] max-md:grid-cols-1 max-md:justify-items-center max-md:gap-0.5 max-md:px-1 max-md:py-0.5 max-md:text-center",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-4 rounded-full border-2 border-line max-md:hidden",
          next && "border-brand bg-brand shadow-[inset_0_0_0_3px_var(--card)]",
          done && "border-ok bg-ok",
          r.kind === "added" && "border-dashed",
        )}
      />
      <span className="min-w-0 max-w-full">
        <span className="block truncate text-[13.5px] font-bold max-md:text-xs max-md:leading-none">
          <span className="md:hidden">{r.short}</span>
          <span className="max-md:hidden">{r.label}</span>
        </span>
        <span className="block truncate text-[10px] leading-tight text-muted-foreground md:hidden">{r.tag}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground max-md:hidden">
          {done ? `${r.sub}${r.canUntick ? (r.kind === "added" ? " · tap to remove" : " · tap to untick") : ""}` : r.sub}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5 max-md:items-center">
        {done && <BandPill band={r.band} className="max-md:px-1 max-md:text-[10.5px]">{formatClock(r.splitMs ?? 0)}</BandPill>}
        {next && <BandPill band={r.band} className="max-md:px-1 max-md:text-[10.5px]">{formatClock(r.liveMs ?? 0)}</BandPill>}
        <span className="text-[11px] whitespace-nowrap text-muted-foreground max-md:hidden">
          {done ? plural(r.mistakes, "mistake") : next ? (started ? "tap when done" : "after Start") : "—"}
        </span>
      </span>
    </button>
  );
}
