"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowLeftRight, Check, LogOut, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { removeFromClass } from "@/lib/teacher/roster-actions";
import { cn } from "@/lib/utils";

export type MoveOption = { id: string; label: string; name: string };

type Step = "closed" | "choose" | "move" | "leave";

/** The roster's own event, so the confirmation outlives the row it came from. */
const NOTICE = "roster-notice";

function announce(message: string) {
  window.dispatchEvent(new CustomEvent(NOTICE, { detail: message }));
}

/**
 * Remove, on a roster row: move the student to another class, or record them
 * as leaving. Approved design: 3 Nov 2026, docs/superpowers/specs/
 * 2026-11-03-roster-remove-student-design.md.
 *
 * Two triggers, one per screen size, because the choice itself is shaped
 * differently: a dropdown menu from `sm` up, and below it the same two
 * choices as a bottom sheet (the Dialog is already a sheet there), where a
 * small floating menu would be a fiddly target. The confirm boxes are the same
 * Dialog either way.
 *
 * The row unmounts when the save lands (the student is no longer on this
 * roster), so the "done" message is raised as a window event and shown by
 * RosterNotice, which lives on the page rather than in the row.
 */
export function RosterRemove({
  studentId, studentName, fromClass, options,
}: {
  studentId: string;
  studentName: string;
  /** The class they are in now, for the wording. */
  fromClass: string;
  /** Classes they can move to: same side, not this one. */
  options: MoveOption[];
}) {
  const [step, setStep] = useState<Step>("closed");
  const [target, setTarget] = useState(options[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = studentName.split(/\s+/)[0] || studentName;
  const targetName = options.find((o) => o.id === target)?.name ?? "";

  const open = (s: Step) => {
    setError(null);
    setStep(s);
  };

  // The "done" message waits for the refreshed list. Raised straight after
  // the save, it read "moved" for about a second while the name was still on
  // the roster. The action's revalidatePath sends the new list back with its
  // own response, and the transition stays pending until that has rendered;
  // by then this row has usually unmounted (the student is no longer here),
  // so the message goes out on unmount. In the all-classes view a moved
  // student stays listed, so the row survives and the message goes out when
  // the transition ends instead.
  //
  // No router.refresh() on top: called inside this transition it left the
  // box on "Moving…" indefinitely (Next 16.2), and the action has already
  // refreshed the page.
  const done = useRef<string | null>(null);
  useEffect(() => () => {
    if (done.current) announce(done.current);
  }, []);
  useEffect(() => {
    if (pending || !done.current) return;
    announce(done.current);
    done.current = null;
    setStep("closed");
  }, [pending]);

  const submit = (choice: Parameters<typeof removeFromClass>[1]) =>
    startTransition(async () => {
      setError(null);
      const r = await removeFromClass(studentId, choice);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      done.current = r.message;
    });

  const trigger = cn(
    "border border-line bg-card font-semibold text-ink-2 transition-colors",
    "hover:border-foreground hover:text-foreground aria-expanded:border-foreground aria-expanded:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );
  const item = cn(
    "flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left outline-none",
    "data-highlighted:bg-muted",
  );

  return (
    <>
      {/* Phone: a slim chip on the stats line. The ::before widens the tap
          area to 44px without the chip looking any bigger. */}
      <button
        type="button"
        onClick={() => open("choose")}
        aria-label={`Remove ${studentName}`}
        aria-haspopup="dialog"
        className={cn(
          trigger,
          "relative h-[30px] px-2 text-xs sm:hidden",
          "before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-['']",
        )}
      >
        Remove
      </button>

      <Menu.Root>
        <Menu.Trigger
          aria-label={`Remove ${studentName}`}
          className={cn(trigger, "hidden h-9 px-3 text-[13px] sm:inline-block")}
        >
          Remove
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="w-[270px] bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
              <Menu.Item className={item} onClick={() => open("move")}>
                <ArrowLeftRight aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">Move to another class…</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">Stays enrolled, changes teacher</span>
                </span>
              </Menu.Item>
              <Menu.Separator className="mx-1.5 my-1 h-px bg-line" />
              <Menu.Item className={cn(item, "text-danger")} onClick={() => open("leave")}>
                <LogOut aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">Leaving the programme…</span>
                  <span className="mt-0.5 block text-xs">Off the class and every register</span>
                </span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Dialog open={step !== "closed"} onOpenChange={(o) => !o && !pending && setStep("closed")}>
        <DialogContent frameClassName="sm:max-w-md" className="space-y-4">
          {step === "choose" && (
            <>
              <DialogHeader>
                <DialogTitle>{studentName}</DialogTitle>
                <DialogDescription>{fromClass}</DialogDescription>
              </DialogHeader>
              <div className="-mx-2 flex flex-col">
                <button type="button" onClick={() => open("move")} className="flex min-h-15 items-center gap-3.5 px-2 py-2 text-left">
                  <span className="grid size-10 shrink-0 place-items-center bg-brand/10 text-brand">
                    <ArrowLeftRight aria-hidden className="size-5" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold">Move to another class</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">Stays enrolled, changes teacher</span>
                  </span>
                </button>
                <button type="button" onClick={() => open("leave")} className="flex min-h-15 items-center gap-3.5 px-2 py-2 text-left text-danger">
                  <span className="grid size-10 shrink-0 place-items-center bg-danger/10">
                    <LogOut aria-hidden className="size-5" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold">Leaving the programme</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">Off the class and every register</span>
                  </span>
                </button>
              </div>
              <button type="button" onClick={() => setStep("closed")} className="h-12 w-full border border-line bg-card text-[15px] font-semibold">
                Cancel
              </button>
            </>
          )}

          {step === "move" && (
            <>
              <DialogHeader>
                <DialogTitle>Move {studentName} to another class</DialogTitle>
                {/* One string, not JSX text around {fromClass}: when that
                    text wraps onto a second source line the compiler drops
                    the space after the class name ("Al-Aqsaand"). */}
                <DialogDescription>
                  {`They leave ${fromClass} and appear on the new teacher's list straight away. `
                    + "Their marks, strikes and hifdh come with them."}
                </DialogDescription>
              </DialogHeader>
              {options.length ? (
                <div>
                  <label htmlFor={`move-${studentId}`} className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    New class
                  </label>
                  <select
                    id={`move-${studentId}`}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-11 w-full border border-line bg-card px-3 text-sm text-foreground"
                  >
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">There is no other class on this side to move them to.</p>
              )}
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button type="button" disabled={pending} onClick={() => setStep("closed")} className="h-11 border border-line bg-card px-4.5 text-sm font-semibold max-sm:h-12">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || !target}
                  onClick={() => submit({ kind: "move", classId: target })}
                  className="h-11 border border-primary bg-primary px-4.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 max-sm:h-12"
                >
                  {pending ? "Moving…" : `Move to ${targetName}`}
                </button>
              </div>
            </>
          )}

          {step === "leave" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-danger">{studentName} is leaving the programme</DialogTitle>
                <DialogDescription>
                  {`They come off ${fromClass} and every register, and can no longer log in. `
                    + "Nothing is deleted, their fee stays recorded, and they can be placed "
                    + "again from Applications."}
                </DialogDescription>
              </DialogHeader>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button type="button" disabled={pending} onClick={() => setStep("closed")} className="h-11 border border-line bg-card px-4.5 text-sm font-semibold max-sm:h-12">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit({ kind: "leave" })}
                  className="h-11 border border-danger bg-danger px-4.5 text-sm font-semibold text-white disabled:opacity-60 max-sm:h-12"
                >
                  {pending ? "Removing…" : `Remove ${first}`}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The "done" line at the bottom of the screen after a move or a leave. It sits
 * above the phone's tab bar by the shell's own measurement of it, and goes by
 * itself after a while or when dismissed.
 */
export function RosterNotice() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const on = (e: Event) => setText((e as CustomEvent<string>).detail);
    window.addEventListener(NOTICE, on);
    return () => window.removeEventListener(NOTICE, on);
  }, []);

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 8000);
    return () => clearTimeout(t);
  }, [text]);

  if (!text) return null;
  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-3 z-40 mx-auto flex max-w-xl items-center gap-3 bg-primary py-2 pr-1 pl-4 text-sm text-primary-foreground shadow-lg",
        "bottom-[calc(var(--chrome-bottom,0px)+0.75rem)] sm:bottom-8",
      )}
    >
      <Check aria-hidden className="size-4.5 shrink-0 text-tertiary-surface" />
      <span className="min-w-0 flex-1 py-1.5">{text}</span>
      <button
        type="button"
        onClick={() => setText(null)}
        aria-label="Dismiss"
        className="grid size-11 shrink-0 place-items-center"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
