"use client";

/**
 * The targets side panel: class time bands (minutes per hizb), class mistake
 * limits, and per-student overrides with a note. Every keystroke previews on
 * the page behind it (the roster or the student's chart); Save writes them.
 *
 * Desktop (lg+): a panel beside the page, which stays usable, so the preview
 * can be read while editing. Below that: a full-height sheet over a scrim.
 * Esc and ✕ close it on both; closing keeps the draft until Discard or Save.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BandPill } from "@/components/murajaah/band-pill";
import { BAND_TONE, bandLimits, formatClock } from "@/lib/murajaah/bands";
import { surahHizbEq } from "@/lib/murajaah/portions";
import { unitMistakeLimit } from "@/lib/murajaah/targets";
import { cn } from "@/lib/utils";
import { useMurajaahTeacher } from "./murajaah-teacher";
import type { OverrideForm, TargetsForm } from "./targets-form";

const YA_SIN = 36;

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3">{children}</div>;
}

function NumberBox({
  id, value, onChange, label, step = 1, invalid, placeholder, className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  step?: number;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode={step < 1 ? "decimal" : "numeric"}
      min={0}
      step={step}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-20 text-right tabular-nums", className)}
    />
  );
}

function Scale({ form }: { form: TargetsForm }) {
  const m = [Number(form.ideal), Number(form.good), Number(form.acceptable)];
  if (!m.every((x) => Number.isFinite(x) && x > 0) || !(m[0] <= m[1] && m[1] <= m[2])) return null;
  const top = m[2] * 1.3;
  const pc = (v: number) => `${((v / top) * 100).toFixed(2)}%`;
  return (
    <div aria-hidden className="relative mt-1 pb-4">
      <div className="flex h-2 overflow-hidden rounded-full">
        <i style={{ width: pc(m[0]), background: BAND_TONE.ideal.fill }} />
        <i style={{ width: pc(m[1] - m[0]), background: BAND_TONE.good.fill }} />
        <i style={{ width: pc(m[2] - m[1]), background: BAND_TONE.acceptable.fill, opacity: 0.55 }} />
        <i className="flex-1" style={{ background: BAND_TONE.slow.fill, opacity: 0.3 }} />
      </div>
      {[0, ...m].map((v, i) => (
        <span
          key={i}
          className="absolute top-3 text-[0.66rem] text-muted-foreground tabular-nums"
          style={{ left: pc(v), transform: i ? "translateX(-50%)" : undefined }}
        >
          {v}{i === 3 ? " min" : ""}
        </span>
      ))}
    </div>
  );
}

function OverrideCard({ o, name }: { o: OverrideForm; name: string }) {
  const { form, setForm, parsed } = useMurajaahTeacher();
  const error = parsed.overrideErrors[o.studentId];
  const set = (patch: Partial<OverrideForm>) =>
    setForm((f) => ({ ...f, overrides: f.overrides.map((x) => (x.studentId === o.studentId ? { ...x, ...patch } : x)) }));
  const remove = () => setForm((f) => ({ ...f, overrides: f.overrides.filter((x) => x.studentId !== o.studentId) }));
  const box = (k: "hizb" | "juz" | "surah10", label: string) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <NumberBox
        value={o[k]}
        onChange={(v) => set({ [k]: v })}
        label={`${name}: ${label}`}
        placeholder={form[k]}
        invalid={!!error && o[k].trim() !== "" && !(Number.isInteger(Number(o[k])) && Number(o[k]) >= 0)}
        className="w-full"
      />
    </label>
  );
  return (
    <li className="grid gap-2.5 rounded-lg border border-border p-3" data-override={o.studentId}>
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm font-semibold">{name}</b>
        <Button variant="ghost" size="icon-sm" onClick={remove} aria-label={`Remove custom limits for ${name}`}>
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {box("hizb", "Per hizb")}
        {box("juz", "Per juz")}
        {box("surah10", "Per 10 pages")}
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Note
        <Input
          value={o.note}
          maxLength={500}
          placeholder="Why this student differs"
          onChange={(e) => set({ note: e.target.value })}
          aria-label={`${name}: note`}
        />
      </label>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </li>
  );
}

export function TargetsPanel() {
  const {
    form, setForm, parsed, dirty, discard, save, saving, savedAt, saveError,
    panelOpen, setPanelOpen, students,
  } = useMurajaahTeacher();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [adding, setAdding] = useState("");

  useEffect(() => {
    if (!panelOpen) return;
    heading.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, setPanelOpen]);

  if (!panelOpen) return null;

  const set = (patch: Partial<TargetsForm>) => setForm((f) => ({ ...f, ...patch }));
  const timeInvalid = !!parsed.targetError && /minutes/i.test(parsed.targetError);
  const limitInvalid = !!parsed.targetError && !timeInvalid;
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const free = students.filter((s) => !form.overrides.some((o) => o.studentId === s.id));
  const addId = free.some((s) => s.id === adding) ? adding : free[0]?.id ?? "";

  // The worked examples under each section, from the values being typed (when they parse).
  const t = parsed.target;
  const juz = t ? bandLimits(2, t.minutes) : null;
  const yaSin = t ? bandLimits(surahHizbEq(YA_SIN), t.minutes) : null;

  const timeRow = (k: "ideal" | "good" | "acceptable", band: "ideal" | "good" | "acceptable", label: string) => (
    <Row>
      <BandPill band={band} size="sm" />
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        up to
        <NumberBox value={form[k]} onChange={(v) => set({ [k]: v })} label={`${label} up to, minutes per hizb`} step={0.5} invalid={timeInvalid} />
        min
      </span>
    </Row>
  );
  const limitRow = (k: "hizb" | "juz" | "surah10", label: string) => (
    <Row>
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        ≤
        <NumberBox value={form[k]} onChange={(v) => set({ [k]: v })} label={`${label}, most mistakes`} invalid={limitInvalid} />
        mistakes
      </span>
    </Row>
  );

  const status = parsed.targetError || Object.keys(parsed.overrideErrors).length
    ? "Fix the marked boxes to save"
    : saving
      ? "Saving…"
      : dirty
        ? "Unsaved: the page shows a preview"
        : savedAt
          ? `Saved at ${savedAt}`
          : "No changes yet";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" aria-hidden onClick={() => setPanelOpen(false)} />
      <aside
        role="dialog"
        aria-labelledby={headingId}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[25rem] flex-col border-l border-border bg-popover text-popover-foreground shadow-xl sm:w-[25rem]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id={headingId} ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Targets</h2>
            <p className="text-sm text-muted-foreground">For the whole class. The page previews them as you type.</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setPanelOpen(false)} aria-label="Close targets">
            <X />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
          <section className="space-y-3" aria-label="Time standards, per hizb">
            <h3 className="label">Time standards, per hizb</h3>
            {timeRow("ideal", "ideal", "Ideal")}
            {timeRow("good", "good", "Good")}
            {timeRow("acceptable", "acceptable", "Acceptable")}
            <Row>
              <BandPill band="slow" size="sm" />
              <span className="text-sm text-muted-foreground">beyond {form.acceptable || "…"} min</span>
            </Row>
            {timeInvalid && <p className="text-xs text-danger" role="alert">{parsed.targetError}</p>}
            <Scale form={form} />
            {juz && yaSin && (
              <p className="text-xs text-muted-foreground">
                A juz counts as 2 hizb: ideal ≤ {formatClock(juz.ideal)}, good ≤ {formatClock(juz.good)}, acceptable ≤{" "}
                {formatClock(juz.acceptable)}. A surah counts as its pages ÷ 10, so Ya-Sin is ideal at ≤ {formatClock(yaSin.ideal)}.
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-border pt-5" aria-label="Mistake limits">
            <h3 className="label">Mistake limits</h3>
            {limitRow("hizb", "Per hizb")}
            {limitRow("juz", "Per juz")}
            {limitRow("surah10", "Per 10 pages of a surah")}
            {limitInvalid && <p className="text-xs text-danger" role="alert">{parsed.targetError}</p>}
            {t && (
              <p className="text-xs text-muted-foreground">
                A surah&apos;s limit scales with its length and rounds up: Ya-Sin allows {unitMistakeLimit("surah", YA_SIN, t.limits)}.
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-border pt-5" aria-label="Per-student overrides">
            <h3 className="label">Per-student overrides</h3>
            <p className="text-xs text-muted-foreground">
              Leave a box empty to use the class limit. Time bands stay the same for everyone.
            </p>
            {form.overrides.length > 0 && (
              <ul className="space-y-2.5">
                {form.overrides.map((o) => (
                  <OverrideCard key={o.studentId} o={o} name={nameOf.get(o.studentId) ?? "Student"} />
                ))}
              </ul>
            )}
            {free.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Student"
                  value={addId}
                  onChange={(e) => setAdding(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                >
                  {free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Button
                  variant="outline"
                  onClick={() => addId && setForm((f) => ({
                    ...f, overrides: [...f.overrides, { studentId: addId, hizb: "", juz: "", surah10: "", note: "" }],
                  }))}
                >
                  Add override
                </Button>
              </div>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p
            className={cn("mr-auto flex min-w-0 items-center gap-1.5 text-xs", dirty ? "text-foreground" : "text-muted-foreground")}
            aria-live="polite"
            data-status
          >
            {dirty && <i aria-hidden className="size-1.5 rounded-full bg-brand" />}
            {!dirty && savedAt && <Check aria-hidden className="size-3.5 text-ok" />}
            {status}
          </p>
          <Button variant="outline" size="lg" onClick={discard} disabled={!dirty || saving}>Discard</Button>
          <Button size="lg" onClick={save} disabled={!dirty || !parsed.valid || saving}>Save targets</Button>
          {saveError && <p className="w-full text-xs text-danger" role="alert">{saveError}</p>}
        </footer>
      </aside>
    </>
  );
}

/** The header button that opens (or closes) the panel, with a dot while unsaved. */
export function TargetsButton({ className }: { className?: string }) {
  const { panelOpen, setPanelOpen, dirty } = useMurajaahTeacher();
  return (
    <Button variant="outline" size="lg" className={className} aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
      <SlidersHorizontal />
      Targets
      {dirty && (
        <>
          <i aria-hidden className="size-1.5 rounded-full bg-brand" />
          <span className="sr-only"> (unsaved changes)</span>
        </>
      )}
    </Button>
  );
}

