"use client";

/**
 * Top right of the builder: print the paper or its mark scheme (the print
 * route opens in a new tab, where "Save as PDF" is the browser's own), and
 * mark the paper final — which stamps each bank question on it as used in
 * "<code> <season>" — or reopen it.
 */
import { useState } from "react";
import { ChevronDown, FileCheck2, LockOpen, Printer, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usedLabel } from "@/lib/exam-builder/labels";
import type { Paper } from "@/lib/exam-builder/types";
import { ActionItem, ActionLink, ActionMenu, ActionSeparator } from "./action-menu";
import { ConfirmDialog } from "./confirm-dialog";

export function ExportMenu({
  paper, bankCount, onSetFinal,
}: {
  paper: Paper;
  /** questions on the paper that came from the bank (the ones that get stamped) */
  bankCount: number;
  onSetFinal: (final: boolean) => Promise<string | void>;
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
        <ActionLink href={`/exam-print/${paper.id}`}>
          <Printer /> Print paper
        </ActionLink>
        <ActionLink href={`/exam-print/${paper.id}?scheme=1`}>
          <ScrollText /> Print mark scheme
        </ActionLink>
        {/* Download Word goes here (plan Task 8): an ActionLink to
            /api/exam-builder/<paperId>/docx (and ?scheme=1). Not rendered
            until that route exists. */}
        <ActionSeparator />
        {final ? (
          <ActionItem onSelect={() => setConfirm("reopen")}>
            <LockOpen /> Reopen for editing
          </ActionItem>
        ) : (
          <ActionItem onSelect={() => setConfirm("final")}>
            <FileCheck2 /> Mark as final…
          </ActionItem>
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
          locked. You can reopen it later, which takes the stamp off again.
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
          It goes back to a draft you can change, and the <strong className="text-foreground">{label}</strong> stamp comes off
          its bank questions until you mark it final again.
        </p>
      </ConfirmDialog>
    </>
  );
}
