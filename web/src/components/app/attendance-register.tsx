"use client";

import { useState, useTransition } from "react";
import { setPresence, markAllPresent } from "@/lib/attendance/actions";
import type { SessionType } from "@/lib/attendance/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RegisterStudent = { id: string; full_name: string };
export type RegisterRecord = {
  student_id: string;
  present: boolean;
  absence_reason: string | null;
  strike_id: string | null;
};

type RowState = {
  present: boolean | null;
  reason: string;
  strike: boolean;
  saving: boolean;
};

/**
 * The register. Everyone starts unmarked; one button fills the room as present
 * and the teacher flips whoever didn't show. An absence can carry a strike, and
 * un-flipping the absence takes that strike back off again.
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
  const [pendingAll, startAll] = useTransition();
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const byStudent = new Map(records.map((r) => [r.student_id, r]));
    return Object.fromEntries(
      students.map((s) => {
        const r = byStudent.get(s.id);
        return [
          s.id,
          {
            present: r ? r.present : null,
            reason: r?.absence_reason ?? "",
            strike: Boolean(r?.strike_id),
            saving: false,
          } satisfies RowState,
        ];
      }),
    );
  });

  const patch = (id: string, next: Partial<RowState>) =>
    setRows((s) => ({ ...s, [id]: { ...s[id], ...next } }));

  async function save(id: string, next: RowState) {
    patch(id, { saving: true });
    await setPresence({
      classId,
      studentId: id,
      sessionDate,
      sessionType,
      present: next.present === true,
      absenceReason: next.reason,
      strike: next.strike,
      termId,
    });
    patch(id, { saving: false });
  }

  function setPresent(id: string, present: boolean) {
    const next: RowState = {
      ...rows[id],
      present,
      // Going back to present clears the reason and any strike that came with it.
      reason: present ? "" : rows[id].reason,
      strike: present ? false : rows[id].strike,
    };
    patch(id, next);
    void save(id, next);
  }

  const counts = students.reduce(
    (acc, s) => {
      const p = rows[s.id]?.present;
      if (p === true) acc.present += 1;
      else if (p === false) acc.absent += 1;
      else acc.unmarked += 1;
      return acc;
    },
    { present: 0, absent: 0, unmarked: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="box c12" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="tabular-nums">
            <span className="text-ok">{counts.present}</span>{" "}
            <span className="text-muted-foreground">present</span>
          </span>
          <span className="tabular-nums">
            <span className="text-danger">{counts.absent}</span>{" "}
            <span className="text-muted-foreground">absent</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {counts.unmarked} not marked
          </span>
        </div>
        {counts.unmarked > 0 && (
          <Button
            size="sm"
            disabled={pendingAll}
            onClick={() =>
              startAll(async () => {
                const unmarked = students.filter((s) => rows[s.id]?.present === null);
                await markAllPresent({
                  classId,
                  studentIds: unmarked.map((s) => s.id),
                  sessionDate,
                  sessionType,
                });
                setRows((s) => {
                  const next = { ...s };
                  for (const st of unmarked) next[st.id] = { ...next[st.id], present: true };
                  return next;
                });
              })
            }
          >
            {pendingAll ? "Marking…" : `Mark remaining ${counts.unmarked} present`}
          </Button>
        )}
      </div>

      <ul className="box c12 divide-y divide-line" style={{ padding: 0, gap: 0 }}>
        {students.map((s) => {
          const row = rows[s.id];
          return (
            <li key={s.id} className="p-3 sm:px-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {s.full_name}
                  {row?.saving && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">saving…</span>
                  )}
                </span>
                <div className="flex shrink-0 overflow-hidden rounded-md border border-line">
                  <button
                    type="button"
                    onClick={() => setPresent(s.id, true)}
                    className={cn(
                      "px-3 py-1.5 text-xs transition-colors",
                      row?.present === true
                        ? "bg-ok/15 font-medium text-ok"
                        : "hover:bg-muted text-muted-foreground",
                    )}
                  >
                    Present
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresent(s.id, false)}
                    className={cn(
                      "border-l border-line px-3 py-1.5 text-xs transition-colors",
                      row?.present === false
                        ? "bg-danger/15 font-medium text-danger"
                        : "hover:bg-muted text-muted-foreground",
                    )}
                  >
                    Absent
                  </button>
                </div>
              </div>

              {row?.present === false && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-0 sm:pl-1">
                  <Input
                    value={row.reason}
                    placeholder="Reason (illness, travel, no reason given…)"
                    onChange={(e) => patch(s.id, { reason: e.target.value })}
                    onBlur={() => void save(s.id, { ...rows[s.id] })}
                    className="h-8 max-w-sm flex-1 text-xs"
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.strike}
                      onChange={(e) => {
                        const next = { ...rows[s.id], strike: e.target.checked };
                        patch(s.id, next);
                        void save(s.id, next);
                      }}
                      className="size-3.5 accent-[var(--danger)]"
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
