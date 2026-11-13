import { describe, it, expect, vi, beforeEach } from "vitest";

const profile = vi.hoisted(() => ({ current: null as null | { role: string; section: string | null } }));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: async () => profile.current }));
vi.mock("@/lib/reference/cached", () => ({ getCachedPageWords: async (n: number) => [{ page_number: n }] }));

import { GET } from "./route";

const get = (page: string) => GET(new Request(`http://x/api/mushaf/${page}`), { params: Promise.resolve({ page }) });

beforeEach(() => { profile.current = null; });

describe("GET /api/mushaf/[page]", () => {
  it("refuses the signed out", async () => {
    expect((await get("590")).status).toBe(401);
  });

  it("gives a student the programme's pages and no earlier ones", async () => {
    profile.current = { role: "student", section: "brothers" };
    const ok = await get("562");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual([{ page_number: 562 }]);
    expect((await get("561")).status).toBe(404);
    expect((await get("1")).status).toBe(404);
  });

  it("gives the ustadhs and teachers the whole mushaf", async () => {
    profile.current = { role: "student", section: "ustadhs" };
    expect((await get("1")).status).toBe(200);
    profile.current = { role: "teacher", section: null };
    expect((await get("1")).status).toBe(200);
    expect((await get("604")).status).toBe(200);
  });

  it("refuses pages that do not exist", async () => {
    profile.current = { role: "teacher", section: null };
    for (const p of ["0", "605", "abc", "5.5"]) expect((await get(p)).status).toBe(404);
  });
});
