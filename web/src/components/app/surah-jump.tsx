"use client";

import { useRouter } from "next/navigation";

export type SurahJumpOption = { number: number; name: string; page: number; current?: boolean };

/** Compact jump-to-surah picker — replaces the chip wall. Navigating sets
 *  the pager's page param to the surah's opening page; given `onPick`, the
 *  page is handed over instead, for a pager that turns in place. */
export function SurahJump({ options, basePath, onPick }: {
  options: SurahJumpOption[];
  basePath: string;
  onPick?: (page: number) => void;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Jump to surah"
      className="h-8 rounded-md border border-line bg-transparent px-2 text-sm"
      defaultValue=""
      onChange={(e) => {
        if (!e.target.value) return;
        if (onPick) onPick(Number(e.target.value));
        else router.push(`${basePath}&page=${e.target.value}`, { scroll: false });
      }}
    >
      <option value="">Jump to surah…</option>
      {options.map((o) => (
        <option key={o.number} value={o.page}>
          {o.name}
          {o.current ? " · current" : ""}
        </option>
      ))}
    </select>
  );
}
