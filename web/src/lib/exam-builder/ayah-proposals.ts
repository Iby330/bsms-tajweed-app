/**
 * The typeset refs proposed for the bank's Qur'an pictures, shipped with the
 * app (ayah-proposals.json, written by execution/exam_bank_ayah_plan.ts from
 * the verified picture mapping). Read on the server only.
 *
 * Two jobs:
 *  - restore: "Keep the picture" on the comparison page clears a slot's ref;
 *    "Use the typeset words" puts back the ref proposed here. No new column:
 *    the proposal is the memory of what the ref was.
 *  - originals: every picture the mapping saw, by bank row. A slide title's
 *    picture leaves `prompt_images` once its term is typed into the question,
 *    so this is where the app still finds it ("See the original picture").
 *    No file is ever deleted from the bucket.
 */
import data from "./ayah-proposals.json";
import type { Proposals, RowProposals } from "./ayah-plan";

export const AYAH_PROPOSALS = data as unknown as Proposals;

export function proposalsFor(bankId: string | null | undefined): RowProposals | undefined {
  return bankId ? AYAH_PROPOSALS[bankId] : undefined;
}

/** Every picture the mapping saw for a bank row: prompt, options, slide title. */
export function originalPaths(bankId: string | null | undefined): string[] {
  const p = proposalsFor(bankId);
  if (!p) return [];
  return [...new Set([...(p.prompt?.images ?? []), ...Object.keys(p.options ?? {}), ...(p.term?.images ?? [])])];
}
