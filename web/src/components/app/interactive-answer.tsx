"use client";

import { TapWords } from "@/components/app/tap-words";
import { TapLetters } from "@/components/app/tap-letters";
import { ChoiceGridView } from "@/components/app/choice-grid";
import { MouthDiagram } from "@/components/app/mouth-diagram";
import { isTapWords } from "@/lib/homework/tap-words";
import { isTapLetters } from "@/lib/homework/tap-letters";
import { isChoiceGrid } from "@/lib/homework/choice-grid";
import { isDiagram } from "@/lib/homework/diagram";

type Option = { position: number; label: string; value?: string; correct?: boolean };

/**
 * True when a question's options are something to work ON — a passage to
 * tap, letters to tap, pairs to match, items to order, a drawing to point
 * at — rather than answers to pick from a list.
 *
 * Each of these rides on an ordinary `mcq` or `checkbox` and is recognised by
 * the shape of its option labels, so the answer is always `{selected:[…]}`
 * and nothing downstream of the form needs to know which one it was.
 */
export function isInteractive(options: Option[] | null | undefined): boolean {
  return isTapWords(options) || isTapLetters(options) || isChoiceGrid(options) || isDiagram(options);
}

/**
 * The one place that turns those option shapes into their surface — the
 * student's form, the teacher's marking screen, the class breakdown and past
 * attempts all draw through it, so a new kind is added here once.
 * `reveal` is the marked view and needs each option's `correct`, which only
 * teacher-side reads (and a student's own approved work) carry.
 */
export function InteractiveAnswer({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
}: {
  options: Option[];
  selected: number[];
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  reveal?: boolean;
}) {
  const props = { options, selected, onChange, readOnly, reveal };
  if (isTapWords(options)) return <TapWords {...props} />;
  if (isTapLetters(options)) return <TapLetters {...props} />;
  if (isChoiceGrid(options)) return <ChoiceGridView {...props} />;
  if (isDiagram(options)) return <MouthDiagram {...props} />;
  return null;
}
