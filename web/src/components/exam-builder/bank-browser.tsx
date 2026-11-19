"use client";

/**
 * The bank page's body: "Write a new question" above the browsable bank. A
 * question written here goes into the bank only, and appears at once under
 * its topic, which opens to show it.
 */
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addBankQuestion } from "@/lib/exam-builder/new-question-actions";
import { topicPath } from "@/lib/exam-builder/topics";
import type { BankQuestion, Topic } from "@/lib/exam-builder/types";
import { BankPanel } from "./bank-panel";
import { useFitPictures } from "./fit-pictures";
import { NewQuestionForm, type NewQuestionInput } from "./new-question-form";

export function BankBrowser({
  topics, questions: initial, profileId,
}: {
  topics: Topic[];
  questions: BankQuestion[];
  profileId: string;
}) {
  const [questions, setQuestions] = useState(initial);
  useFitPictures();
  const [writing, setWriting] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const submit = async (q: NewQuestionInput): Promise<string | void> => {
    const res = await addBankQuestion(q);
    if (!res.ok) return res.error;
    setQuestions((qs) => [...qs, res.question]);
    setReveal(res.question.topic_id);
    setAdded(topicPath(res.question.topic_id, topics));
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
      <BankPanel topics={topics} questions={questions} reveal={reveal} className="border border-line bg-card" />
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
