"use client";

/**
 * Every paper the teacher can open, newest change first: their own, the
 * other teachers' drafts (anyone can work on a draft; its card says who made
 * it). A paper is a card that
 * opens the builder. Its heading is the paper's name, renamed in place (final papers
 * too), with the printed title under it. A draft can be deleted from here
 * (a final paper has to be reopened first, which the builder does).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EyeOff, FileText, Lock, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPaper, deletePaper, updatePaper } from "@/lib/exam-builder/actions";
import { usedLabel } from "@/lib/exam-builder/labels";
import { formatMarks } from "@/lib/exam-builder/numbering";
import type { PaperSummary } from "@/lib/exam-builder/queries";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { PaperNameField } from "./paper-name-field";

function edited(at: string): string {
  const d = new Date(at);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return `today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}

/** Private (only its owner), Draft (every teacher can work on it), or Final (locked). */
export function StatusChip({ final, shared = false, className }: { final: boolean; shared?: boolean; className?: string }) {
  if (final) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-semibold text-ok", className)}>
        <Lock className="size-3" aria-hidden /> Final
      </span>
    );
  }
  return shared ? (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-semibold text-brand", className)}>
      <Users className="size-3" aria-hidden /> Draft
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground", className)}>
      <EyeOff className="size-3" aria-hidden /> Private
    </span>
  );
}

export function NewPaperButton({ size = "lg", label = "New paper" }: { size?: "lg" | "default"; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1.5">
      <Button
        size={size}
        className={size === "lg" ? "h-11 px-4 text-[0.95rem]" : undefined}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await createPaper();
            if (!res.ok) setError(res.error);
            else router.push(`/teacher/exam-builder/${res.id}`);
          })
        }
      >
        <Plus aria-hidden /> {pending ? "Making the paper…" : label}
      </Button>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function PaperList({ papers, meId }: { papers: PaperSummary[]; meId: string }) {
  const router = useRouter();
  // Deleted ones are hidden at once; the rest always follow the server's list,
  // so a refresh (after edits in the builder) shows the new counts.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const list = papers.filter((p) => !gone.has(p.id));
  const [deleting, setDeleting] = useState<PaperSummary | null>(null);
  // Names changed here, until the server's list catches up on the next visit.
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const nameOf = (p: PaperSummary) => renamed[p.id] ?? p.name;
  /** How a paper is called in labels: its name, else its printed title. */
  const called = (p: PaperSummary) => nameOf(p) || p.title;
  const rename = async (id: string, name: string) => {
    const res = await updatePaper(id, { name });
    if (res.ok) setRenamed((r) => ({ ...r, [id]: name }));
    return res;
  };

  if (list.length === 0) {
    return (
      <div className="grid justify-items-center gap-4 border border-dashed border-line bg-card px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
          <FileText className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1.5">
          <h2 className="text-lg font-semibold">No papers yet</h2>
          <p className="max-w-[46ch] text-sm text-muted-foreground">
            A new paper starts with last year&apos;s three sections and notes. Pick questions from the
            bank by topic and they appear on the paper as you go.
          </p>
        </div>
        <NewPaperButton label="Start your first paper" />
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2">
        {list.map((p) => {
          const final = p.status === "final";
          const theirs = p.owner_id !== meId;
          return (
            <li key={p.id} className="group relative flex flex-col gap-3 bg-card p-5 transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_3%,var(--card))]">
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[0.7rem] tracking-[0.12em] text-ink-3 uppercase">
                  {p.code} · {p.season}
                </span>
                <StatusChip final={final} shared={p.shared} />
              </div>
              {final && (
                <p className="-mt-1 text-xs text-muted-foreground">
                  Its bank questions are stamped <b className="font-semibold text-ok">{usedLabel(p.code, p.season)}</b>
                </p>
              )}
              <div className="grid gap-0.5">
                {/* Above the card-wide link, so a click on the name edits it instead of opening the paper. */}
                <h2 className="relative z-10 min-w-0">
                  <PaperNameField
                    name={nameOf(p)}
                    onSave={(name) => rename(p.id, name)}
                    inputClassName="text-lg leading-snug"
                  />
                </h2>
                <Link
                  href={`/teacher/exam-builder/${p.id}`}
                  className="w-fit rounded-sm text-sm text-muted-foreground outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring underline-offset-4"
                >
                  <span className="sr-only">Open </span>
                  {p.title}
                  {nameOf(p) && <span className="sr-only"> ({nameOf(p)})</span>}
                </Link>
              </div>
              {theirs && (
                <p className="-mt-1.5 text-sm text-muted-foreground">
                  by <span className="font-medium text-foreground">{p.ownerName ?? "another teacher"}</span>
                </p>
              )}
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <div>
                  <dt className="sr-only">Questions</dt>
                  <dd><b className="font-semibold text-foreground tabular-nums">{p.itemCount}</b> {p.itemCount === 1 ? "question" : "questions"}</dd>
                </div>
                <div>
                  <dt className="sr-only">Total marks</dt>
                  <dd><b className="font-semibold text-foreground tabular-nums">{formatMarks(p.totalMarks)}</b> marks</dd>
                </div>
                {p.date_label && (
                  <div>
                    <dt className="sr-only">Date</dt>
                    <dd>{p.date_label}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-muted-foreground">Edited {edited(p.updated_at)}</span>
                {/* Above the card-wide link, so it stays its own target. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative z-10 text-muted-foreground hover:text-danger"
                  disabled={final}
                  title={final ? "Reopen the paper before deleting it" : undefined}
                  onClick={() => setDeleting(p)}
                  aria-label={`Delete ${called(p)}`}
                >
                  <Trash2 aria-hidden /> Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title="Delete this paper?"
        confirmLabel="Delete paper"
        tone="destructive"
        onConfirm={async () => {
          if (!deleting) return;
          const res = await deletePaper(deleting.id);
          if (!res.ok) return res.error;
          const id = deleting.id;
          setGone((g) => new Set([...g, id]));
          router.refresh();
        }}
      >
        <p>
          <strong className="text-foreground">{deleting ? called(deleting) : ""}</strong> and the {deleting?.itemCount ?? 0}{" "}
          {deleting?.itemCount === 1 ? "question" : "questions"} on it will be gone for good
          {deleting?.shared ? ", for every teacher" : ""}. The question bank is not touched.
        </p>
      </ConfirmDialog>
    </>
  );
}
