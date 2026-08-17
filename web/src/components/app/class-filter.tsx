"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterSelect } from "@/components/app/filter-select";

/**
 * Which class the homework screens are looking at.
 *
 * The choice lives in `?class=` rather than component state so a teacher can
 * send "have a look at Rayyan's" as a link, and so the marking screen can carry
 * the class back with it — approve a script, land back on the class you were
 * marking. The teacher's own class is the default and stays out of the URL.
 *
 * `replace` with `scroll: false`: pushing would fill the back button with one
 * entry per class tried, and jumping to the top of a register you are part-way
 * down is disorienting.
 */
export function ClassFilter({
  classes,
  selected,
  own,
}: {
  classes: { id: string; name: string }[];
  /** Class id, or null when looking at every class in the section. */
  selected: string | null;
  /** The teacher's own class — the value that needs no query string. */
  own: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // One class to choose from is not a choice; a teacher with a section of their
  // own alone is better off with the heading that already names it.
  if (classes.length < 2) return null;

  return (
    <FilterSelect
      label="Class"
      value={selected ?? "all"}
      options={[
        { value: "all", label: "All classes" },
        ...classes.map((c) => ({ value: c.id, label: c.name })),
      ]}
      onChange={(value) => {
        const next = new URLSearchParams(params.toString());
        if (value === own) next.delete("class");
        else next.set("class", value);
        // A student picked in the old class is not in the new one, and a stale
        // id would land the results view on "hasn't handed this in".
        next.delete("student");
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
    />
  );
}
