"use client";

/**
 * The paper's name, edited in place like a document title: "Advanced",
 * "Lower". It is the teacher's own label for telling papers of the same exam
 * apart; it is never printed. Looks like the heading until hovered or
 * focused. Saves on blur and on Enter, quietly and at once; a refusal puts
 * the last saved name back and says why underneath. Escape drops the edit.
 *
 * Used as the card heading on the paper list and in the paper screen's top
 * bar. A final paper can still be renamed (the server allows a name-only
 * change on one).
 */
import { useRef, useState } from "react";
import { PAPER_LIMITS } from "@/lib/exam-builder/validate";
import type { Result } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";

export const UNTITLED = "Untitled paper";
const OFFLINE = "Couldn't reach the server. Check the connection and try again.";

export function PaperNameField({
  name, onSave, className, inputClassName,
}: {
  /** The saved name ("" when unnamed). */
  name: string;
  onSave: (name: string) => Promise<Result>;
  className?: string;
  inputClassName?: string;
}) {
  // The last name the server took (or is taking). Follows the prop when the
  // parent's copy changes, e.g. after a save from the "Paper details" dialog.
  const [saved, setSaved] = useState(name);
  const [prev, setPrev] = useState(name);
  if (name !== prev) {
    setPrev(name);
    setSaved(name);
  }
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Escape blurs the field too; the blur must not save what was just dropped.
  const dropping = useRef(false);
  // Only the latest save may put an older name back on a refusal.
  const latest = useRef(0);

  const commit = async () => {
    if (dropping.current) {
      dropping.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === saved) return;
    const before = saved;
    const seq = ++latest.current;
    setSaved(next);
    setError(null);
    let res: Result;
    try {
      res = await onSave(next);
    } catch {
      res = { ok: false, error: OFFLINE };
    }
    if (!res.ok && seq === latest.current) {
      setSaved(before);
      setError(res.error);
    }
  };

  return (
    // Spans, not divs: this sits inside a heading.
    <span className={cn("grid min-w-0 justify-items-start", className)}>
      <input
        type="text"
        value={draft ?? saved}
        placeholder={UNTITLED}
        maxLength={PAPER_LIMITS.name}
        aria-label="Paper name"
        title="Click to rename"
        autoComplete="off"
        spellCheck={false}
        // A fallback width where field-sizing is not supported.
        size={Math.max((draft ?? saved).length, UNTITLED.length) + 1}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setError(null)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            dropping.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "field-sizing-content -ml-1.5 max-w-full min-w-[10ch] truncate rounded-md border-0 bg-transparent px-1.5 py-0.5 font-semibold text-foreground outline-none [font-family:inherit] placeholder:text-muted-foreground placeholder:font-normal hover:bg-foreground/5 focus:bg-foreground/5 max-sm:min-h-11",
          inputClassName,
        )}
      />
      {error && <span className="text-xs font-normal text-danger" role="alert">{error}</span>}
    </span>
  );
}
