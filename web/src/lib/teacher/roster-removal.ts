/**
 * Taking a student off a class roster: the decision, with no I/O.
 *
 * Two outcomes, and they are exactly what the Applications board already
 * does through syncAccounts (lib/applications/actions.ts), so the board and
 * the roster can never disagree about where someone is:
 *
 *   move   the application stays placed and points at the new class; the
 *          profile follows it there and stays active.
 *   leave  the application is declined; the profile goes inactive and loses
 *          its class, which takes it off every register and teacher screen
 *          (they all filter on is_active). Placing them again on the board
 *          reverses it. Nothing is deleted.
 *
 * Kept apart from the server action so the rules can be tested without a
 * database. The action reads the rows, asks this what to write, and writes it.
 */

export type RemovalChoice = { kind: "move"; classId: string } | { kind: "leave" };

export type ClassRef = { id: string; name: string; section: string };

export type RemovalInput = {
  student: { id: string; full_name: string; section: string; class_id: string | null };
  /** The student's class now, if it still exists. */
  current: ClassRef | null;
  /** The class asked for, on a move. Null when it was not found. */
  target: ClassRef | null;
  choice: RemovalChoice;
};

export type RemovalPlan = {
  profile: { class_id: string | null; is_active: boolean };
  application: { status: "placed" | "declined"; class_id?: string };
  note: string;
  /** What the teacher is told once it is done. */
  message: string;
};

export type PlanResult = { ok: true; plan: RemovalPlan } | { ok: false; error: string };

/** Only the two real sides take students; `demo` is a training cohort. */
const SIDES = new Set(["brothers", "sisters"]);

export function planRemoval({ student, current, target, choice }: RemovalInput): PlanResult {
  const from = current?.name ?? "their class";

  if (choice.kind === "leave") {
    return {
      ok: true,
      plan: {
        profile: { class_id: null, is_active: false },
        application: { status: "declined" },
        note: `Left the programme (was in ${from}).`,
        message: `${student.full_name} has left ${from}. They can be placed again from Applications.`,
      },
    };
  }

  if (!target) return { ok: false, error: "That class no longer exists." };
  if (target.id === student.class_id) {
    return { ok: false, error: `${student.full_name} is already in ${target.name}.` };
  }
  if (!SIDES.has(target.section) || target.section !== student.section) {
    return { ok: false, error: `${target.name} is not a ${student.section}' class.` };
  }

  return {
    ok: true,
    plan: {
      profile: { class_id: target.id, is_active: true },
      application: { status: "placed", class_id: target.id },
      note: `Moved from ${from} to ${target.name}.`,
      message: `${student.full_name} moved to ${target.name}.`,
    },
  };
}
