/** Which surahs a reviewer may mark. The programme works through its list in
 *  order; the ustadhs present portions from anywhere in it. */
export function reviewableSurahs<S extends { number: number }>(
  list: S[], passed: Set<number>, section: string | null | undefined,
): (S & { passed: boolean; current: boolean })[] {
  const current = list.find((s) => !passed.has(s.number))?.number ?? null;
  return list
    .filter((s) => section === "ustadhs" || passed.has(s.number) || s.number === current)
    .map((s) => ({ ...s, passed: passed.has(s.number), current: s.number === current }));
}
