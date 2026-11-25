"use client";

/**
 * The bank page's body: "Write a new question" above the browsable bank. A
 * question written here goes into the bank only, and appears at once under
 * its topic, which opens to show it.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateBankQuestion } from "@/lib/exam-builder/bank-actions";
import { addBankQuestion } from "@/lib/exam-builder/new-question-actions";
import { topicPath } from "@/lib/exam-builder/topics";
import type { BankQuestion, Topic } from "@/lib/exam-builder/types";
import { BankPanel } from "./bank-panel";
import { useFitPictures } from "./fit-pictures";
import { BankEditor, type BankEditPatch } from "./item-editor";
import { NewQuestionForm, type NewQuestionInput } from "./new-question-form";

export function BankBrowser({
  topics, questions: initial, profileId, canEdit = false,
}: {
  /** A teacher: each question carries Edit, which changes the bank's original. */
  canEdit?: boolean;
  topics: Topic[];
  questions: BankQuestion[];
  profileId: string;
}) {
  const [questions, setQuestions] = useState(initial);
  const router = useRouter();
  useFitPictures();
  const [writing, setWriting] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankQuestion | null>(null);

  const saveEdit = async (id: string, patch: BankEditPatch, imageUrls: Record<string, string>) => {
    const res = await updateBankQuestion(id, patch);
    if (!res.ok) return res;
    setQuestions((qs) => qs.map((q) => (q.id === id ? {
      ...q, ...patch,
      prompt: (patch.prompt ?? q.prompt).trim(),
      options: (patch.kind ?? q.kind) === "short" ? null : patch.options ?? q.options,
      imageUrls: { ...q.imageUrls, ...imageUrls },
    } : q)));
    if (patch.topic_id) setReveal(patch.topic_id);
    setAdded(null);
    router.refresh();
    return res;
  };

  const submit = async (q: NewQuestionInput): Promise<string | void> => {
    const res = await addBankQuestion(q);
    if (!res.ok) return res.error;
    setQuestions((qs) => [...qs, res.question]);
    setReveal(res.question.topic_id);
    setAdded(topicPath(res.question.topic_id, topics));
    // The page header counts the bank on the server; refresh it so the new question is counted.
    router.refresh();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={() => { setAdded(null); setWriting(true); }} disabled={!profileId}>
          <Plus aria-hidden /> Write a new question
        </Button>
        {added && (
          <p className="inline-flex items-center gap-1.5 text-sm text-ok" role="status">
            <Check className="size-4" aria-hidden /> Added to the bank under {added}.
          </p>
        )}
      </div>
      <BankPanel topics={topics} questions={questions} reveal={reveal} className="border border-line bg-card" onEdit={canEdit ? setEditing : undefined} />
      <BankEditor
        question={editing} topics={topics} profileId={profileId}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSave={saveEdit}
      />
      <NewQuestionForm
        open={writing}
        onOpenChange={setWriting}
        topics={topics}
        profileId={profileId}
        mode="bank"
        onSubmit={submit}
      />
    </>
  );
}
