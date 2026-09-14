"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterSelect } from "@/components/app/filter-select";

export type PickerStudent = {
  id: string;
  /** Name plus how they did — "Tariq Lindqvist · 82%", "Harun Delgado · not handed in". */
  label: string;
};

/**
 * Which student's script the Individual tab is reading.
 *
 * A row of every name used to run across the top. That is fine for four and
 * unreadable for twenty — it scrolled sideways, and the answer to "who else is
 * there" was hidden off the edge of the screen. One control that names the
 * student in view and opens onto the rest says the same thing in a fixed width.
 *
 * `FilterSelect` is a native select on purpose: a phone hands off to its own
 * picker rather than asking us to position and dismiss a menu inside a page
 * that already scrolls, and the keyboard works without being asked.
 *
 * Students who have handed in nothing stay in the list rather than being
 * disabled. The page has something to say about them — "hasn't handed this
 * in" — and a teacher checking who is missing should be able to land there.
 *
 * `push`, not `replace`: the prev/next arrows beside this are links and push,
 * and a picker that quietly did the opposite would make the back button behave
 * differently depending on which control you reached the student with.
 */
export function StudentPicker({
  students,
  selected,
  size = "sm",
}: {
  students: PickerStudent[];
  selected: string | null;
  /** `lg` where the picker stands in for the student's name as the heading. */
  size?: "sm" | "lg";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (students.length === 0) return null;

  return (
    <FilterSelect
      label="Student"
      // The name is the heading at `lg`; a visible "Student" beside it would
      // be labelling the obvious. Screen readers still get it.
      hideLabel={size === "lg"}
      size={size}
      value={selected ?? ""}
      options={[
        // Only until someone is chosen: once a script is open there is no
        // "nobody" to go back to, and offering it would empty the page.
        ...(selected ? [] : [{ value: "", label: "Pick a student…" }]),
        ...students.map((s) => ({ value: s.id, label: s.label })),
      ]}
      onChange={(value) => {
        if (!value) return;
        const next = new URLSearchParams(params.toString());
        next.set("student", value);
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    />
  );
}
