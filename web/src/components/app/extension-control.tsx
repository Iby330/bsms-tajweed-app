"use client";

import { useState, useTransition } from "react";
import { setExtension } from "@/lib/homework/extension-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "Thu 15 Oct, 20:15", in London: pinned, or the server (UTC) and the
 *  browser would render different hours and the page would not hydrate. */
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/London",
  });

/** An ISO instant as a datetime-local value, on the reader's own clock. */
function localInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * More time for one student on one homework.
 *
 * The date is picked and shown on the teacher's own clock, and the browser
 * turns it into an instant before it leaves: teachers and students are all
 * on UK time, and doing the conversion here means the server never has to
 * guess what zone "20:15" meant. A new extension starts a week past the
 * deadline the student has now, which is the usual ask.
 */
export function ExtensionControl({
  homeworkId,
  studentId,
  studentName,
  dueAt,
  extended,
}: {
  homeworkId: string;
  studentId: string;
  studentName: string;
  /** Their deadline as it stands, extension included. Null: none set. */
  dueAt: string | null;
  /** Whether that deadline is an extension. */
  extended: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() =>
    localInput(dueAt ? new Date(Date.parse(dueAt) + (extended ? 0 : WEEK_MS)).toISOString() : new Date(Date.now() + WEEK_MS).toISOString()),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (next: string | null) =>
    start(async () => {
      const result = await setExtension(homeworkId, studentId, next);
      setError(result.error);
      if (!result.error) setEditing(false);
    });

  return (
    <div className="box c12 gap-2">
      <p className="text-sm">
        {dueAt ? (
          <>
            Due for {studentName}: <span className="tabular-nums">{when(dueAt)}</span>
            {extended && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">extended</span>}
          </>
        ) : (
          <>No deadline is set for {studentName}.</>
        )}
      </p>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-auto md:h-8 md:text-xs"
            aria-label={`New deadline for ${studentName}`}
          />
          <Button size="sm" disabled={pending || !value} onClick={() => run(new Date(value).toISOString())}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {extended ? "Change the date" : "Give more time"}
          </Button>
          {extended && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(null)}>
              {pending ? "Removing…" : "Back to the class deadline"}
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
