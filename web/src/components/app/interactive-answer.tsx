"use client";

import { TapWords } from "@/components/app/tap-words";
import { TapLetters } from "@/components/app/tap-letters";
import { ChoiceGridView } from "@/components/app/choice-grid";
import { MouthDiagram } from "@/components/app/mouth-diagram";
import { RuleHunt } from "@/components/app/rule-hunt";
import { isTapWords } from "@/lib/homework/tap-words";
import { isTapLetters } from "@/lib/homework/tap-letters";
import { isChoiceGrid } from "@/lib/homework/choice-grid";
import { isDiagram } from "@/lib/homework/diagram";
import { isRuleHunt } from "@/lib/homework/rule-hunt";

type Option = { position: number; label: string; value?: string; correct?: boolean; inst?: string | null };


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
  if (isRuleHunt(options)) return <RuleHunt {...props} />;
  return null;
}
