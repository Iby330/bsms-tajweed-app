import { describe, expect, it } from "vitest";
import { planRemoval, type ClassRef } from "./roster-removal";

const salsabeel: ClassRef = { id: "c-sal", name: "Salsabeel", section: "sisters" };
const hareer: ClassRef = { id: "c-har", name: "Hareer", section: "sisters" };
const aqsa: ClassRef = { id: "c-aqs", name: "Al-Aqsa", section: "brothers" };
const demo: ClassRef = { id: "c-demo", name: "Demo", section: "demo" };

const layla = { id: "s1", full_name: "Layla Ahmed", section: "sisters", class_id: "c-sal" };

describe("planRemoval", () => {
  it("moves a student: the application stays placed in the new class, the profile follows", () => {
    const r = planRemoval({ student: layla, current: salsabeel, target: hareer, choice: { kind: "move", classId: "c-har" } });
    expect(r).toEqual({
      ok: true,
      plan: {
        profile: { class_id: "c-har", is_active: true },
        application: { status: "placed", class_id: "c-har" },
        note: "Moved from Salsabeel to Hareer.",
        message: "Layla Ahmed moved to Hareer.",
      },
    });
  });

  it("a leaver is declined and goes inactive with no class; nothing else is written", () => {
    const r = planRemoval({ student: layla, current: salsabeel, target: null, choice: { kind: "leave" } });
    expect(r.ok && r.plan).toEqual({
      profile: { class_id: null, is_active: false },
      application: { status: "declined" },
      note: "Left the programme (was in Salsabeel).",
      message: "Layla Ahmed has left Salsabeel. They can be placed again from Applications.",
    });
  });

  it("refuses a class on the other side", () => {
    const r = planRemoval({ student: layla, current: salsabeel, target: aqsa, choice: { kind: "move", classId: "c-aqs" } });
    expect(r).toEqual({ ok: false, error: "Al-Aqsa is not a sisters' class." });
  });

  it("refuses the demo cohort, even for a student somehow in it", () => {
    const stray = { ...layla, section: "demo" };
    const r = planRemoval({ student: stray, current: salsabeel, target: demo, choice: { kind: "move", classId: "c-demo" } });
    expect(r.ok).toBe(false);
  });

  it("refuses a move to the class they are already in", () => {
    const r = planRemoval({ student: layla, current: salsabeel, target: salsabeel, choice: { kind: "move", classId: "c-sal" } });
    expect(r).toEqual({ ok: false, error: "Layla Ahmed is already in Salsabeel." });
  });

  it("refuses a class that was not found", () => {
    const r = planRemoval({ student: layla, current: salsabeel, target: null, choice: { kind: "move", classId: "gone" } });
    expect(r).toEqual({ ok: false, error: "That class no longer exists." });
  });

  it("still words the note when the current class has gone", () => {
    const r = planRemoval({ student: { ...layla, class_id: null }, current: null, target: hareer, choice: { kind: "move", classId: "c-har" } });
    expect(r.ok && r.plan.note).toBe("Moved from their class to Hareer.");
  });
});
