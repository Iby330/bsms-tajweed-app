import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase/migrations");
const REWRITE = "0132_acting_id_rewrite.sql";

/** Copying an old policy forward with auth.uid() would quietly break it for a
 *  seat. Storage policies and the finance functions keep auth.uid() on purpose. */
describe("migrations after the acting_id rewrite", () => {
  it("use acting_id(), not auth.uid()", () => {
    const later = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f > REWRITE);
    const offenders = later.filter((f) => {
      const sql = readFileSync(join(DIR, f), "utf8").replace(/--.*$/gm, "");
      return sql.includes("auth.uid()") && !/storage\.objects|log_finance_change|record_fee_deposit/.test(sql);
    });
    expect(offenders).toEqual([]);
  });
});
