import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { CountdownChip } from "@/components/app/countdown-chip";
import { statusChip } from "@/lib/homework/logic";
import type { Module } from "@/lib/curriculum/tree";
import { cn } from "@/lib/utils";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Action({
  href,
  children,
  muted,
}: {
  href: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        muted
          ? "border-line text-muted-foreground hover:border-ink/30 hover:text-foreground"
          : "border-line bg-page hover:border-ink/30",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * One week of a course: its video(s) and its homework, side by side.
 *
 * A locked week still renders — the weekly-release mechanic is only credible
 * if you can see what is coming and when.
 */
export function ModuleRow({
  module: m,
  pct,
}: {
  module: Module;
  /** Approved homework percentage, when the teacher has marked it. */
  pct?: number;
}) {
  const chip = m.homework ? statusChip(m.submission) : null;

  return (
    <li
      className={cn(
        "rounded-lg border p-4",
        !m.unlocked && "border-dashed border-line",
        m.unlocked && m.done && "border-line bg-card",
        m.unlocked && !m.done && "border-line bg-card",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              "text-[11px] uppercase tracking-wider",
              m.unlocked ? "text-muted-foreground" : "text-muted-foreground/70",
            )}
          >
            Week {m.weekNumber}
          </span>
          {m.title && (
            <MixedText
              text={m.title}
              className={cn(
                "mt-0.5 block text-sm font-medium leading-snug",
                !m.unlocked && "text-muted-foreground",
              )}
            />
          )}
        </div>

        {m.unlocked ? (
          m.done ? (
            <span className="shrink-0 text-xs text-ok">complete ✓</span>
          ) : !m.actionable ? (
            <span className="shrink-0 text-xs text-muted-foreground">not ready</span>
          ) : null
        ) : (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            unlocks {dmy(m.unlockAt)}
          </span>
        )}
      </div>

      {m.unlocked && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {m.lessons.map((l) =>
            l.youtube_id ? (
              <Action key={l.id} href={`/lessons/${l.id}`}>
                <span aria-hidden>▸</span>
                <span>{m.lessons.length > 1 ? l.title : "Watch"}</span>
                {m.watched && <span className="text-ok">✓</span>}
              </Action>
            ) : (
              <Action key={l.id} href={`/lessons/${l.id}`} muted>
                <span aria-hidden>▸</span>
                <span>Video coming soon</span>
              </Action>
            ),
          )}

          {m.homework && (
            <Action href={`/homework/${m.homework.number}`} muted={m.submission === "approved"}>
              <span>
                {m.homework.series === "tfp" ? "TFP" : "Homework"}{" "}
                {m.homework.number > 100 ? m.homework.number - 100 : m.homework.number}
              </span>
              {chip && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium",
                    chip.tone === "ok" && "bg-ok/12 text-ok",
                    chip.tone === "warn" && "bg-warn/12 text-warn",
                    chip.tone === "ink" && "bg-muted text-foreground",
                    chip.tone === "muted" && "bg-muted text-muted-foreground",
                  )}
                >
                  {chip.label}
                  {m.submission === "approved" && pct !== undefined && (
                    <span className="ml-1 tabular-nums">{Math.round(pct)}%</span>
                  )}
                </span>
              )}
            </Action>
          )}

          {m.homework?.due_at && !m.submission && <CountdownChip dueAt={m.homework.due_at} />}
        </div>
      )}
    </li>
  );
}
