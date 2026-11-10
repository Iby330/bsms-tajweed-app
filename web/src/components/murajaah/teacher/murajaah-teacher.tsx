"use client";

/**
 * The teacher's murāja'ah pages share one client state: the class's saved
 * data from the server, and the targets panel's draft. It lives in the
 * murājaʿah layout, so the draft and the open panel survive moving between
 * the roster and a student, and both pages preview the same unsaved edit.
 *
 * Save calls saveTargets with the FULL override list (one left out loses
 * its override, which is how Remove works), then refreshes the route; the
 * fresh saved data resets the form.
 */
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveTargets } from "@/lib/murajaah/actions";
import type { SessionView } from "@/lib/murajaah/sessions";
import type { TargetOverride } from "@/lib/murajaah/targets";
import { cn } from "@/lib/utils";
import type { RosterStudent } from "./roster-data";
import { formOf, isDirty, parseForm, previewOf, type ParsedForm, type SavedTargets, type TargetsForm } from "./targets-form";

export type MurajaahTeacherData = {
  classId: string;
  className: string;
  /** The class's active students, by name. */
  students: RosterStudent[];
  /** Every saved session in the class, any order. */
  sessions: SessionView[];
  saved: SavedTargets;
  /** The server's clock (ms), so day counts agree on both sides. */
  now: number;
};

type Ctx = MurajaahTeacherData & {
  /** What the pages show: the valid draft, else the saved targets. */
  preview: SavedTargets;
  overrideFor: (studentId: string) => TargetOverride | null;
  form: TargetsForm;
  setForm: (next: TargetsForm | ((f: TargetsForm) => TargetsForm)) => void;
  parsed: ParsedForm;
  dirty: boolean;
  discard: () => void;
  save: () => void;
  saving: boolean;
  savedAt: string | null;
  saveError: string | null;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
};

const MurajaahCtx = createContext<Ctx | null>(null);

export function useMurajaahTeacher(): Ctx {
  const v = useContext(MurajaahCtx);
  if (!v) throw new Error("useMurajaahTeacher outside MurajaahTeacher");
  return v;
}

const keyOf = (s: SavedTargets) => JSON.stringify(s);
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function MurajaahTeacher({ data, children }: { data: MurajaahTeacherData; children: ReactNode }) {
  const router = useRouter();
  const [form, setForm] = useState<TargetsForm>(() => formOf(data.saved));
  const [base, setBase] = useState(() => keyOf(data.saved));
  const [panelOpen, setPanelOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Fresh saved data from the server (after Save, or a reload) resets the form.
  const key = keyOf(data.saved);
  if (key !== base) {
    setBase(key);
    setForm(formOf(data.saved));
  }

  const parsed = useMemo(() => parseForm(form), [form]);
  const preview = useMemo(() => previewOf(form, data.saved), [form, data.saved]);
  const dirty = useMemo(() => isDirty(form, data.saved), [form, data.saved]);
  const byStudent = useMemo(() => new Map(preview.overrides.map((o) => [o.studentId, o])), [preview]);
  const overrideFor = useCallback((id: string) => byStudent.get(id) ?? null, [byStudent]);

  const discard = useCallback(() => {
    setForm(formOf(data.saved));
    setSaveError(null);
  }, [data.saved]);

  const save = useCallback(() => {
    if (!parsed.valid || !parsed.target) return;
    const target = parsed.target;
    const overrides = parsed.overrides;
    setSaveError(null);
    startSaving(async () => {
      try {
        await saveTargets(data.classId, target, overrides);
        setSavedAt(CLOCK.format(new Date()));
        router.refresh();
      } catch (e) {
        setSaveError(e instanceof Error && e.message ? e.message : "The targets did not save. Try again.");
      }
    });
  }, [parsed, data.classId, router]);

  const value: Ctx = {
    ...data, preview, overrideFor, form, setForm, parsed, dirty, discard, save, saving, savedAt, saveError,
    panelOpen, setPanelOpen,
  };

  return (
    <MurajaahCtx.Provider value={value}>
      {/* On a desktop the panel sits beside the page, not over it, so the preview stays in view. */}
      <div className={cn("transition-[padding] duration-200", panelOpen && "lg:pr-[25rem]")}>{children}</div>
    </MurajaahCtx.Provider>
  );
}
