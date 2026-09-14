"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDay } from "@/lib/format";
import {
  placeInClass, setApplicationNotes, setApplicationStatus, setAssessedLevel, setFeeSettled,
} from "@/lib/applications/actions";
import type { ApplicationRow, ClassOption, Status, Section } from "@/lib/applications/queries";

/**
 * The intake screen.
 *
 * Built around the sequence the programme actually runs — apply, be heard at
 * the online recitation session, be placed in a group by level — rather than
 * around the table's columns. So the default order is oldest work first
 * within the filter, the counts across the top are the ones worth acting on
 * ("still to hear"), and every control writes immediately: there is no Save,
 * because a screen worked through during a session with a list of people in
 * front of you must not lose anything to a forgotten button.
 */

const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  invited: "Invited",
  assessed: "Heard",
  placed: "Placed",
  declined: "Declined",
};

/** The order the intake moves through, for the picker and for sorting. */
const STATUS_ORDER: Status[] = ["new", "invited", "assessed", "placed", "declined"];

const selectCls =
  "h-8 rounded-lg border border-line bg-background px-2 text-sm text-foreground";

const money = (pence: number) => `£${(pence / 100).toFixed(2).replace(/\.00$/, "")}`;

/** One answer, shown as a labelled line. */
function Answer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="label">{label}</span>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  );
}

function ApplicationCard({ row, classes }: { row: ApplicationRow; classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Local copies so the row reflects a change instantly. The server action
  // revalidates the page underneath, which re-renders this with the stored
  // value — these only cover the gap.
  const [status, setStatus] = useState(row.status);
  const [level, setLevel] = useState(row.assessed_level ?? "");
  const [classId, setClassId] = useState(row.class_id ?? "");
  const [settled, setSettled] = useState(row.fee_settled);
  const [notes, setNotes] = useState(row.notes ?? "");

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  const name = `${row.first_name} ${row.surname}`;
  // Only classes on their own side: the brothers and sisters are taught
  // separately, so offering the other side's classes could only ever be a way
  // to make a mistake.
  const options = classes.filter((c) => c.section === row.section);

  return (
    <div className={cn("box c12 !items-stretch gap-0 p-0", pending && "opacity-60")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180")}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.section === "brothers" ? "Brothers" : "Sisters"} · {row.university}
            {" · "}Year {row.year_of_study}{" · applied "}{fmtDay(row.created_at.slice(0, 10))}
          </span>
        </span>
        {!settled && (
          <span
            className="shrink-0 rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground"
            title={row.paid_confirmed
              ? "They ticked that they paid; the money has not been marked as received"
              : "They did not confirm payment"}
          >
            fee
          </span>
        )}
        <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs">
          {STATUS_LABEL[status]}
        </span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-line p-4">
          {/* ── What they told us ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Answer label="Email">
              <a href={`mailto:${row.email}`} className="underline underline-offset-2">
                {row.email}
              </a>
            </Answer>
            <Answer label="Phone">
              {/* The stored number reads "+44 7700900123"; a tel: URI wants no
                  spaces, so the link strips them while the text keeps them. */}
              <a
                href={`tel:${row.phone.replace(/\s+/g, "")}`}
                className="underline underline-offset-2"
              >
                {row.phone}
              </a>
            </Answer>
            <Answer label="Memorised">{row.memorised}</Answer>
            <Answer label="Been on the course before">
              {row.enrolled_before ? "Yes" : "No"}
            </Answer>
            <Answer label="Reads Arabic">{row.arabic_reading}</Answer>
            <Answer label="Tajweed level (their own words)">{row.tajweed_level}</Answer>
            <Answer label="Heard about us via">{row.heard_from}</Answer>
            <Answer label="Fee">
              {money(row.fee_pence)}{" · "}
              {row.paid_confirmed ? "they confirmed paying" : "not confirmed"}
            </Answer>
          </div>

          <Answer label="Why they want to join">
            <span className="block max-w-[70ch] whitespace-pre-wrap">{row.motivation}</span>
          </Answer>

          {/* ── What we do about it ── */}
          <div className="space-y-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <label className="space-y-1.5">
                <span className="label block">Where they are</span>
                <select
                  className={selectCls}
                  value={status}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.value as Status;
                    setStatus(next);
                    run(() => setApplicationStatus(row.id, next));
                  }}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="label block">Class</span>
                <select
                  className={selectCls}
                  value={classId}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.value;
                    setClassId(next);
                    // Choosing a class IS the placement, so the status moves
                    // with it rather than being a second thing to remember.
                    setStatus(next ? "placed" : "assessed");
                    run(() => placeInClass(row.id, next || null));
                  }}
                >
                  <option value="">Not placed yet</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={settled}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSettled(next);
                    run(() => setFeeSettled(row.id, next));
                  }}
                />
                Fee received
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="label block">What you heard at the recitation session</span>
              <Input
                value={level}
                disabled={pending}
                maxLength={200}
                placeholder="e.g. solid makhārij, shaky on mudūd — group 2"
                onChange={(e) => setLevel(e.target.value)}
                onBlur={() => {
                  if (level !== (row.assessed_level ?? "")) {
                    run(() => setAssessedLevel(row.id, level));
                  }
                }}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="label block">Notes</span>
              <Textarea
                rows={2}
                value={notes}
                disabled={pending}
                maxLength={2000}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== (row.notes ?? "")) {
                    run(() => setApplicationNotes(row.id, notes));
                  }
                }}
              />
            </label>
            {/* Both fields above save when they lose focus, which is invisible
                unless it is said. Without this people press Enter, nothing
                appears to happen, and they retype it. */}
            <p className="text-xs text-muted-foreground">
              The level and notes save when you click away.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApplicationsBoard({
  rows, classes,
}: { rows: ApplicationRow[]; classes: ClassOption[] }) {
  const [section, setSection] = useState<Section | "all">("all");
  const [status, setStatus] = useState<Status | "all" | "todo">("todo");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (section !== "all" && r.section !== section) return false;
      // "Still to hear" is the filter the screen opens on, because it is the
      // only one that names an action. It is new + invited: everyone who has
      // applied and not yet recited.
      if (status === "todo" && r.status !== "new" && r.status !== "invited") return false;
      if (status !== "all" && status !== "todo" && r.status !== status) return false;
      if (!needle) return true;
      return `${r.first_name} ${r.surname} ${r.email}`.toLowerCase().includes(needle);
    });
  }, [rows, section, status, q]);

  const counts = useMemo(() => {
    const inSection = section === "all" ? rows : rows.filter((r) => r.section === section);
    return {
      total: inSection.length,
      toHear: inSection.filter((r) => r.status === "new" || r.status === "invited").length,
      placed: inSection.filter((r) => r.status === "placed").length,
      owing: inSection.filter((r) => !r.fee_settled && r.status !== "declined").length,
    };
  }, [rows, section]);

  return (
    <div className="space-y-6">
      <div className="field">
        <section className="box c12 gap-5">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <Figure label="Applications" value={counts.total} />
            <Figure label="Still to hear" value={counts.toHear} tone="brand" />
            <Figure label="Placed" value={counts.placed} />
            <Figure label="Fee not received" value={counts.owing} tone="danger" />
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Side"
          className={selectCls}
          value={section}
          onChange={(e) => setSection(e.target.value as Section | "all")}
        >
          <option value="all">Both sides</option>
          <option value="brothers">Brothers</option>
          <option value="sisters">Sisters</option>
        </select>
        <select
          aria-label="Status"
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "all" | "todo")}
        >
          <option value="todo">Still to hear</option>
          <option value="all">Everyone</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <Input
          type="search"
          placeholder="Search by name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-full max-w-[16rem] text-sm"
        />
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          {rows.length === 0
            ? "No applications yet. The form is at /apply."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="field">
          {shown.map((r) => (
            <ApplicationCard key={r.id} row={r} classes={classes} />
          ))}
        </div>
      )}
    </div>
  );
}

function Figure({
  label, value, tone,
}: { label: string; value: number; tone?: "brand" | "danger" }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div
        className={cn(
          "mt-1 font-heading text-3xl tabular-nums",
          tone === "brand" && value > 0 && "text-brand",
          tone === "danger" && value > 0 && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}
