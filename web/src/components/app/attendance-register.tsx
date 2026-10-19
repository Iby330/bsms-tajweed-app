"use client";

import { useEffect, useState, useTransition } from "react";
import { saveRegister } from "@/lib/attendance/actions";
import type { SessionType } from "@/lib/attendance/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RegisterStudent = { id: string; full_name: string };
export type RegisterRecord = {
  student_id: string;
  present: boolean;
  /** Present, but came in late (0118). Absent on rows read before it. */
  late?: boolean;
  absence_reason: string | null;
  strike_id: string | null;
};

type RowState = {
  present: boolean | null;
  /** Only ever true on a present row: late is a way of being there. */
  late: boolean;
  reason: string;
  strike: boolean;
};

type Mark = "present" | "late" | "absent";

/** Whether a row differs from what was last saved, as the server would see it. */
function changed(a: RowState, b: RowState) {
  if (a.present !== b.present) return true;
  if (a.present === true) return a.late !== b.late;
  if (a.present !== false) return false;
  return a.reason.trim() !== b.reason.trim() || a.strike !== b.strike;
}

/**
 * The register. Everyone starts unmarked; one button fills the room as present
 * and the teacher flips whoever didn't show, or came in late. Late is present
 * (it counts as attended, and carries no reason or strike); an absence can
 * carry a strike, and un-flipping the absence takes that strike back off.
 *
 * Nothing is written until Save. The register keeps what was last saved beside
 * the draft, so Save lights up only while the two differ and sends just the
 * rows that do — saving again overwrites them.
 */
export function AttendanceRegister({
  classId,
  termId,
  sessionDate,
  sessionType,
  students,
  records,
}: {
  classId: string;
  termId: number;
  sessionDate: string;
  sessionType: SessionType;
  students: RegisterStudent[];
  records: RegisterRecord[];
}) {
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, RowState>>(() => {
    const byStudent = new Map(records.map((r) => [r.student_id, r]));
    return Object.fromEntries(
      students.map((s) => {
        const r = byStudent.get(s.id);
        return [
          s.id,
          {
            present: r ? r.present : null,
            late: Boolean(r?.present && r.late),
            reason: r?.absence_reason ?? "",
            strike: Boolean(r?.strike_id),
          } satisfies RowState,
        ];
      }),
    );
  });
  const [rows, setRows] = useState<Record<string, RowState>>(saved);

  const patch = (id: string, next: Partial<RowState>) =>
    setRows((s) => ({ ...s, [id]: { ...s[id], ...next } }));

  // An unmarked row has nothing to write, so it never counts as a change.
  const dirty = students.filter(
    (s) => rows[s.id].present !== null && changed(rows[s.id], saved[s.id]),
  );
  const isDirty = dirty.length > 0;
  const everSaved = students.some((s) => saved[s.id].present !== null);

  // Leaving with unsaved marks loses them, so the browser asks first.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function save() {
    const batch = dirty.map((s) => ({ id: s.id, row: rows[s.id] }));
    setError(null);
    startSave(async () => {
      const result = await saveRegister({
        classId,
        sessionDate,
        sessionType,
        termId,
        rows: batch.map(({ id, row }) => ({
          studentId: id,
          present: row.present === true,
          late: row.present === true && row.late,
          absenceReason: row.reason,
          strike: row.strike,
        })),
      });
      const landed = result.ok ? batch.map((b) => b.id) : result.saved;
      setSaved((s) => {
        const next = { ...s };
        for (const { id, row } of batch) if (landed.includes(id)) next[id] = row;
        return next;
      });
      if (!result.ok) setError(result.error);
    });
  }

  function setMark(id: string, mark: Mark) {
    const present = mark !== "absent";
    patch(id, {
      present,
      late: mark === "late",
      // Going back to present clears the reason and any strike that came with it.
      reason: present ? "" : rows[id].reason,
      strike: present ? false : rows[id].strike,
    });
  }

  const counts = students.reduce(
    (acc, s) => {
      const p = rows[s.id]?.present;
      if (p === true) acc.present += 1;
      else if (p === false) acc.absent += 1;
      else acc.unmarked += 1;
      if (p === true && rows[s.id].late) acc.late += 1;
      return acc;
    },
    { present: 0, late: 0, absent: 0, unmarked: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="box c12" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="tabular-nums">
            <span className="text-ok">{counts.present}</span>{" "}
            <span className="text-muted-foreground">present</span>
            {counts.late > 0 && (
              <span className="text-muted-foreground"> ({counts.late} late)</span>
            )}
          </span>
          <span className="tabular-nums">
            <span className="text-danger">{counts.absent}</span>{" "}
            <span className="text-muted-foreground">absent</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {counts.unmarked} not marked
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {counts.unmarked > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() =>
                setRows((s) => {
                  const next = { ...s };
                  for (const st of students)
                    if (next[st.id].present === null) next[st.id] = { ...next[st.id], present: true, late: false };
                  return next;
                })
              }
            >
              Mark remaining {counts.unmarked} present
            </Button>
          )}
          <Button size="sm" disabled={!isDirty || saving} onClick={save}>
            {saving
              ? "Saving…"
              : isDirty
                ? `Save${everSaved ? " changes" : ""} (${dirty.length})`
                : everSaved
                  ? "Saved"
                  : "Save"}
          </Button>
        </div>
        {error && <p className="basis-full text-sm text-danger">Not saved: {error}</p>}
      </div>

      <ul className="box c12 divide-y divide-line" style={{ padding: 0, gap: 0 }}>
        {students.map((s) => {
          const row = rows[s.id];
          return (
            <li key={s.id} className="p-3 sm:px-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {s.full_name}
                  {row.present !== null && changed(row, saved[s.id]) && (
                    <span className="ml-2 text-xs font-normal text-warn">unsaved</span>
                  )}
                </span>
                <div className="flex shrink-0 overflow-hidden rounded-md border border-line" role="group" aria-label={`${s.full_name}'s attendance`}>
                  {(["present", "late", "absent"] as const).map((mark, i) => {
                    const on =
                      mark === "absent" ? row?.present === false
                      : mark === "late" ? row?.present === true && row.late
                      : row?.present === true && !row.late;
                    return (
                      <button
                        key={mark}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setMark(s.id, mark)}
                        className={cn(
                          "min-h-11 px-4 text-sm transition-colors md:min-h-0 md:px-3 md:py-1.5 md:text-xs",
                          i > 0 && "border-l border-line",
                          on && mark === "present" && "bg-ok/15 font-medium text-ok",
                          on && mark === "late" && "bg-warn/15 font-medium text-warn",
                          on && mark === "absent" && "bg-danger/15 font-medium text-danger",
                          !on && "hover:bg-muted text-muted-foreground",
                        )}
                      >
                        {mark === "present" ? "Present" : mark === "late" ? "Late" : "Absent"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {row?.present === false && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-0 sm:pl-1">
                  <Input
                    value={row.reason}
                    placeholder="Reason (illness, travel, no reason given…)"
                    onChange={(e) => patch(s.id, { reason: e.target.value })}
                    className="max-w-sm flex-1 md:h-8 md:text-xs"
                  />
                  <label className="flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-xs text-muted-foreground md:min-h-0">
                    <input
                      type="checkbox"
                      checked={row.strike}
                      onChange={(e) => patch(s.id, { strike: e.target.checked })}
                      className="size-5 accent-[var(--danger)] md:size-3.5"
                    />
                    Issue a strike
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {students.length === 0 && (
        <p className="text-sm text-muted-foreground">No students in this class yet.</p>
      )}
    </div>
  );
}
