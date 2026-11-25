"use client";

/**
 * Top right of the builder: print the paper or its mark scheme (the print
 * route opens in a new tab, where "Save as PDF" is the browser's own),
 * download either as a Word file (/api/exam-builder/<id>/docx), and
 * mark the paper final — which stamps each bank question on it as used in
 * "<code> <season>" — or reopen it. On a draft (shared) its owner
 * can make it private again from here.
 */
import { useState } from "react";
import { ChevronDown, EyeOff, FileCheck2, FileDown, LockOpen, Printer, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usedLabel } from "@/lib/exam-builder/labels";
import type { Paper } from "@/lib/exam-builder/types";
import { ActionDownload, ActionHeading, ActionItem, ActionLink, ActionMenu, ActionSeparator } from "./action-menu";
import { ConfirmDialog } from "./confirm-dialog";

export function ExportMenu({
  paper, bankCount, onSetFinal, onMakePrivate,
}: {
  paper: Paper;
  /** questions on the paper that came from the bank (the ones that get stamped) */
  bankCount: number;
  onSetFinal: (final: boolean) => Promise<string | void>;
  /** Shown on a draft (shared paper) to its owner. */
  onMakePrivate?: () => void;
}) {
  const [confirm, setConfirm] = useState<"final" | "reopen" | null>(null);
  const final = paper.status === "final";
  const label = usedLabel(paper.code, paper.season);

  return (
    <>
      <ActionMenu
        trigger={
          <Button size="lg">
            <Printer aria-hidden /> <span className="max-sm:hidden">Print &amp; finish</span><span className="sm:hidden">Print</span> <ChevronDown aria-hidden />
          </Button>
        }
      >
        <ActionHeading>Print</ActionHeading>
        <ActionLink href={`/exam-print/${paper.id}`}>
          <Printer /> Print paper
        </ActionLink>
        <ActionLink href={`/exam-print/${paper.id}?scheme=1`}>
          <ScrollText /> Print mark scheme
        </ActionLink>
        <ActionSeparator />
        <ActionHeading>Word</ActionHeading>
        <ActionDownload href={`/api/exam-builder/${paper.id}/docx`}>
          <FileDown /> Download paper (Word)
        </ActionDownload>
        <ActionDownload href={`/api/exam-builder/${paper.id}/docx?scheme=1`}>
          <FileDown /> Download mark scheme (Word)
        </ActionDownload>
        <p className="max-w-64 px-2.5 pt-0.5 pb-1.5 text-xs leading-snug text-muted-foreground">
          Opens in Word, or upload it to Google Drive to edit as a Google Doc.
        </p>
        <ActionSeparator />
        <ActionHeading>Finish</ActionHeading>
        {final ? (
          <ActionItem onSelect={() => setConfirm("reopen")}>
            <LockOpen /> Reopen for editing
          </ActionItem>
        ) : (
          <ActionItem onSelect={() => setConfirm("final")}>
            <FileCheck2 /> Mark as final…
          </ActionItem>
        )}
        {onMakePrivate && (
          <>
            <ActionSeparator />
            <ActionHeading>Shared</ActionHeading>
            <ActionItem onSelect={onMakePrivate}>
              <EyeOff /> Make private…
            </ActionItem>
          </>
        )}
      </ActionMenu>

      <ConfirmDialog
        open={confirm === "final"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Mark this paper as final?"
        confirmLabel={`Mark final as ${label}`}
        onConfirm={() => onSetFinal(true)}
      >
        <p>
          The {bankCount} {bankCount === 1 ? "question" : "questions"} on it from the bank will be stamped{" "}
          <strong className="text-foreground">{label}</strong>, so teachers can see they have been used. The paper is then
          locked{paper.shared ? " for every teacher" : ""}. It can be reopened later, which takes the stamp off again.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "reopen"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Reopen this paper?"
        confirmLabel="Reopen for editing"
        onConfirm={() => onSetFinal(false)}
      >
        <p>
          It goes back to {paper.shared ? "a draft every teacher can change" : "a private paper you can change"}, and the <strong className="text-foreground">{label}</strong> stamp comes off
          its bank questions until you mark it final again.
        </p>
      </ConfirmDialog>
    </>
  );
}
