import { describe, it, expect, vi } from "vitest";
import { readAll } from "./read-all";

/** A fake table of `n` rows served the way PostgREST serves `.range()`. */
const table = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => i);
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
};

describe("readAll", () => {
  it("reads past the page size instead of stopping at it", async () => {
    const page = table(2500);
    const rows = await readAll(page, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toBe(2499);
    expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const page = table(2000);
    expect(await readAll(page, 1000)).toHaveLength(2000);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it("one call for a small read", async () => {
    const page = table(3);
    expect(await readAll(page, 1000)).toEqual([0, 1, 2]);
    expect(page).toHaveBeenCalledOnce();
  });

  it("throws rather than returning a short list", async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    await expect(readAll(page)).rejects.toThrow("boom");
  });
});
