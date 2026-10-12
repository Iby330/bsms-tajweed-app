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
 *
 * Here, not beside InteractiveAnswer: that file is "use client", and a server
 * component that calls a function from a client file throws during the server
 * render. Past attempts did, and every paper sent back for a redo opened on
 * the error page.
 */
export function isInteractive(options: Option[] | null | undefined): boolean {
  return isTapWords(options) || isTapLetters(options) || isChoiceGrid(options) || isDiagram(options);
}
