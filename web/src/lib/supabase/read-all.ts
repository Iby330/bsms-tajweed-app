/**
 * PostgREST stops every read at 1000 rows and says nothing about it — a short
 * read looks exactly like a small class. `readAll` keeps asking for the next
 * page until one comes back short.
 *
 * `page(from, to)` must be the full query with a deterministic `.order(...)`
 * (ending on a unique column) and `.range(from, to)` applied, or rows can
 * repeat or vanish between pages.
 */
export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function readAll<T>(
  page: (from: number, to: number) => PageResult<T>,
  size = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}
