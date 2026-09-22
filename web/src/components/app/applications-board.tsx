"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fmtDay } from "@/lib/format";
import { SURAHS, surahByNumber } from "@/lib/quran/surahs";
import {
  placeInClass, sendLogin, setApplicationNotes, setApplicationStatus, setAssessedLevel,
  setFeeSettled, setReadPassage,
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

/** Every value the column can hold, including the two the screen no longer
 *  offers: a row written before migration 0037 must still render. */
const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  invited: "Invited",
  assessed: "Heard",
  placed: "Placed",
  declined: "Declined",
};

/**
 * The three states the intake actually has: waiting, in a class, or not
 * going ahead. 'invited' and 'assessed' stay in the database type but are
 * not offered; being heard is recorded by what was heard, not by a state.
 */
const STATUS_ORDER: Status[] = ["new", "placed", "declined"];

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

/**
 * What we are asking them to read: surah, then first and last ayah.
 *
 * The ayah lists are the chosen surah's own length, so a range that does not
 * exist cannot be picked. Changing surah clears the ayahs rather than keeping
 * numbers that meant something else. Saves on every change, like the rest of
 * this screen.
 */
function PassagePicker({ row }: { row: ApplicationRow }) {
  const [pending, startTransition] = useTransition();
  const [surah, setSurah] = useState(row.read_surah);
  const [from, setFrom] = useState(row.read_ayah_from);
  const [to, setTo] = useState(row.read_ayah_to);

  const chosen = surah ? surahByNumber(surah) : undefined;
  const ayahs = chosen ? Array.from({ length: chosen.ayahs }, (_, i) => i + 1) : [];

  const save = (s: number | null, f: number | null, t: number | null) =>
    startTransition(() => void setReadPassage(row.id, s, f, t));

  return (
    <div className="space-y-1.5">
      <span className="label block">What to read at the session</span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Surah"
          className={selectCls}
          value={surah ?? ""}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value ? Number(e.target.value) : null;
            setSurah(next); setFrom(null); setTo(null);
            save(next, null, null);
          }}
        >
          <option value="">Not set</option>
          {SURAHS.map((s) => (
            <option key={s.number} value={s.number}>{s.number}. {s.name}</option>
          ))}
        </select>

        {chosen && (
          <>
            <select
              aria-label="First ayah"
              className={selectCls}
              value={from ?? ""}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                setFrom(next);
                // A last ayah now before the first is no longer a range.
                const t = next !== null && to !== null && to < next ? null : to;
                setTo(t);
                save(surah, next, t);
              }}
            >
              <option value="">Ayah</option>
              {ayahs.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">to</span>
            <select
              aria-label="Last ayah"
              className={selectCls}
              value={to ?? ""}
              disabled={pending || from === null}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                setTo(next);
                save(surah, from, next);
              }}
            >
              <option value="">End</option>
              {ayahs.filter((n) => from === null || n >= from)
                .map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">
              {chosen.nameAr} · {chosen.ayahs} ayahs
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Placed, and so ready for (or already sent) a login. */
const canSendLogin = (r: { status: Status; class_id: string | null }) =>
  r.status === "placed" && r.class_id !== null;

const chipCls =
  "shrink-0 rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide";

function ApplicationCard({
  row, classes, selected, onSelect,
}: {
  row: ApplicationRow; classes: ClassOption[];
  selected: boolean; onSelect: (on: boolean) => void;
}) {
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
  const [loginMsg, setLoginMsg] = useState<string | null>(null);

  // A bulk action from the bar above changes rows this card is showing, and
  // the revalidated props arrive without remounting it (which would snap an
  // open card shut). Follow the stored values when they move; adjusted during
  // render, as React recommends, rather than in an effect a frame late.
  const [seen, setSeen] = useState({ status: row.status, classId: row.class_id });
  if (seen.status !== row.status || seen.classId !== row.class_id) {
    setSeen({ status: row.status, classId: row.class_id });
    setStatus(row.status);
    setClassId(row.class_id ?? "");
  }

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  const name = `${row.first_name} ${row.surname}`;
  // Only classes on their own side: the brothers and sisters are taught
  // separately, so offering the other side's classes could only ever be a way
  // to make a mistake.
  const options = classes.filter((c) => c.section === row.section);

  return (
    <div className={cn("box c12 !items-stretch gap-0 p-0", pending && "opacity-60")}>
      <div className="flex items-center">
      {/* Beside the toggle rather than inside it: a checkbox within a button
          is invalid markup, and ticking would open the card too. */}
      <label className="flex self-stretch items-center pl-4">
        <input
          type="checkbox"
          className="size-4"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Select ${name}`}
        />
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
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
        {!row.confirmation_sent_at && (
          <span
            className={cn(chipCls, "text-danger")}
            title="The confirmation email did not go out. Message them yourself."
          >
            no email
          </span>
        )}
        {row.login_sent_at && (
          <span className={cn(chipCls, "text-foreground")} title="Their login email has been sent">
            login sent
          </span>
        )}
        {!settled && (
          <span
            className={cn(chipCls, "text-muted-foreground")}
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
      </div>

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

            {canSendLogin({ status, class_id: classId || null }) && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant={row.login_sent_at ? "outline" : "default"}
                  disabled={pending}
                  onClick={() => {
                    setLoginMsg(null);
                    startTransition(async () => {
                      const r = await sendLogin(row.id);
                      setLoginMsg(r.ok ? `Sent to ${row.email}.` : r.error);
                    });
                  }}
                >
                  {row.login_sent_at ? "Resend login" : "Send login"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {loginMsg
                    ?? (row.login_sent_at
                      ? `Last sent ${fmtDay(row.login_sent_at.slice(0, 10))}. Resending gives them a fresh link.`
                      : "Makes their account and emails them a link to set their password.")}
                </span>
              </div>
            )}

            <PassagePicker row={row} />

            <label className="block space-y-1.5">
              <span className="label block">What you heard at the recitation session</span>
              <Input
                value={level}
                disabled={pending}
                maxLength={200}
                placeholder="e.g. solid makhārij, shaky on mudūd, group 2"
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
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (section !== "all" && r.section !== section) return false;
      // "Still to hear" is the filter the screen opens on, because it is the
      // only one that names an action. It is new + invited: everyone who has
      // applied and not yet recited.
      if (status === "todo" && r.status !== "new") return false;
      if (status !== "all" && status !== "todo" && r.status !== status) return false;
      if (!needle) return true;
      return `${r.first_name} ${r.surname} ${r.email}`.toLowerCase().includes(needle);
    });
  }, [rows, section, status, q]);

  const counts = useMemo(() => {
    const inSection = section === "all" ? rows : rows.filter((r) => r.section === section);
    return {
      total: inSection.length,
      toHear: inSection.filter((r) => r.status === "new").length,
      placed: inSection.filter((r) => r.status === "placed").length,
      loginToSend: inSection.filter((r) => canSendLogin(r) && !r.login_sent_at).length,
      owing: inSection.filter((r) => !r.fee_settled && r.status !== "declined").length,
    };
  }, [rows, section]);

  return (
    <div className="space-y-6">
      <div className="field">
        <section className="box c12 gap-5">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <Figure label="Applications" value={counts.total} />
            <Figure label="Still to decide" value={counts.toHear} tone="brand" />
            <Figure label="Placed" value={counts.placed} />
            <Figure label="Login to send" value={counts.loginToSend} tone="brand" />
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
          <option value="todo">Still to decide</option>
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

      {shown.length > 0 && (
        <label className="flex items-center gap-2 pl-4 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4"
            checked={shown.every((r) => picked.has(r.id))}
            onChange={(e) => {
              const next = new Set(picked);
              for (const r of shown) {
                if (e.target.checked) next.add(r.id); else next.delete(r.id);
              }
              setPicked(next);
            }}
          />
          Select all {shown.length} shown
        </label>
      )}

      {picked.size > 0 && (
        <BulkBar
          rows={rows.filter((r) => picked.has(r.id))}
          classes={classes}
          onClear={() => setPicked(new Set())}
        />
      )}

      {shown.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          {rows.length === 0
            ? "No applications yet. The form is at /apply."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="field">
          {shown.map((r) => (
            <ApplicationCard
              key={r.id} row={r} classes={classes}
              selected={picked.has(r.id)}
              onSelect={(on) => {
                const next = new Set(picked);
                if (on) next.add(r.id); else next.delete(r.id);
                setPicked(next);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What can be done to everyone ticked at once: place them in a class,
 * decline them, or send their logins.
 *
 * Sticky, so it stays in reach while scrolling the list to tick more people.
 * Selection survives changing the filters, which is deliberate (tick the
 * brothers, switch to "Placed" to check them, send), so the bar always says
 * how many are ticked in total rather than how many are on screen.
 */
function BulkBar({
  rows, classes, onClear,
}: { rows: ApplicationRow[]; classes: ClassOption[]; onClear: () => void }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // A class can only be offered when everyone ticked is on the same side:
  // brothers and sisters are taught separately.
  const sides = new Set(rows.map((r) => r.section));
  const side = sides.size === 1 ? [...sides][0] : null;
  const options = side ? classes.filter((c) => c.section === side) : [];

  const ready = rows.filter(canSendLogin);
  const ids = rows.map((r) => r.id);

  function place(classId: string) {
    const cls = classes.find((c) => c.id === classId);
    setMsg(null);
    startTransition(async () => {
      const r = await placeInClass(ids, classId);
      setMsg(!r.ok
        ? r.error
        : `Placed ${ids.length - (r.skipped ?? 0)} in ${cls?.name}.`
          + (r.skipped ? ` ${r.skipped} skipped (other side).` : ""));
    });
  }

  function decline() {
    if (!confirm(`Decline ${ids.length} ${ids.length === 1 ? "person" : "people"}? `
      + "No email is sent. Anyone whose login went out loses access until placed again.")) return;
    setMsg(null);
    startTransition(async () => {
      const r = await setApplicationStatus(ids, "declined");
      setMsg(r.ok ? `Declined ${ids.length}.` : r.error);
    });
  }

  /**
   * One person per request, in turn, so the list can show where it is up to
   * and a failure names who it was. See sendLogin for why not one big call.
   */
  function sendAll() {
    const already = ready.filter((r) => r.login_sent_at).length;
    if (!confirm(`Email a login to ${ready.length} ${ready.length === 1 ? "person" : "people"}?`
      + (already ? ` ${already} already had one and will get a fresh link.` : ""))) return;
    setMsg(null);
    startTransition(async () => {
      const failed: string[] = [];
      for (const [n, r] of ready.entries()) {
        setProgress(`Sending ${n + 1} of ${ready.length}…`);
        const res = await sendLogin(r.id);
        if (!res.ok) failed.push(`${r.first_name} ${r.surname}: ${res.error}`);
      }
      setProgress(null);
      setMsg(failed.length === 0
        ? `Sent ${ready.length} ${ready.length === 1 ? "login" : "logins"}.`
        : `Sent ${ready.length - failed.length}. Not sent: ${failed.join("; ")}`);
    });
  }

  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 rounded-xl border border-line bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{rows.length} ticked</span>

        <select
          aria-label="Place ticked in a class"
          className={selectCls}
          value=""
          disabled={pending || !side}
          title={side ? undefined : "Tick one side at a time to place in a class"}
          onChange={(e) => e.target.value && place(e.target.value)}
        >
          <option value="">{side ? "Place in class…" : "Place in class (one side only)"}</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <Button size="sm" disabled={pending || ready.length === 0} onClick={sendAll}>
          Send login{ready.length === 1 ? "" : "s"} ({ready.length})
        </Button>

        <Button size="sm" variant="outline" disabled={pending} onClick={decline}>
          Decline
        </Button>

        <Button size="sm" variant="ghost" disabled={pending} onClick={onClear}>
          Clear
        </Button>
      </div>
      {(progress || msg) && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">{progress ?? msg}</p>
      )}
      {!progress && ready.length < rows.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Logins go only to people placed in a class: {ready.length} of the {rows.length} ticked.
        </p>
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
