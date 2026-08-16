/**
 * seed_deposits.ts — demo data for the deposit tracker and season finances.
 *
 * Run:  npx tsx execution/seed_deposits.ts
 * Idempotent: clears and rewrites this season's tracker rows each time.
 *
 * ALL NAMES HERE ARE INVENTED, in line with seed_demo.ts. The structure is
 * taken from the real Deposit Tracker sheet — Y/N, first deposit, re-entries,
 * per-term strike counters, notes, and a costs ledger — but none of the real
 * roster, figures or notes are reproduced.
 *
 * The unlinked entries are the point of the exercise as much as the linked
 * ones: the sheet's roster is mostly people who never became app users, and
 * the tracker has to hold them without inventing accounts to suit the books.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// Dependencies live in web/node_modules and Node resolves from this file's
// directory, so a bare import cannot find them however you invoke this.
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** People who left, or never arrived — invented, and deliberately unlinked. */
const UNLINKED: {
  name: string; section: "brothers" | "sisters"; strikes: [number, number, number]; note: string;
}[] = [
  { name: "Idris Kamara",     section: "brothers", strikes: [3, 0, 0], note: "Knocked out — attendance" },
  { name: "Yusuf Demir",      section: "brothers", strikes: [3, 0, 0], note: "Knocked out — homework" },
  { name: "Bilal Osman",      section: "brothers", strikes: [0, 0, 0], note: "Waiting list — declined a place" },
  { name: "Kareem Sultan",    section: "brothers", strikes: [0, 0, 0], note: "Never made it to lesson 1" },
  { name: "Layla Benali",     section: "sisters",  strikes: [0, 3, 0], note: "Dropped out in term 2" },
  { name: "Amina Chaudhry",   section: "sisters",  strikes: [0, 0, 0], note: "Waiting list — no reply" },
  { name: "Zahra Novak",      section: "sisters",  strikes: [1, 0, 3], note: "Knocked out — term 3" },
  { name: "Hafsa Diallo",     section: "sisters",  strikes: [0, 0, 0], note: "Exchange student, left early" },
];

/** Costs, in the shape the sheet keeps them. Invented figures. */
const COSTS: { description: string; category: string; amount: number; reimbursed: boolean }[] = [
  { description: "End of term 2 gift bags",        category: "gifts",    amount: 24.40, reimbursed: true  },
  { description: "Prizes — sisters' side",         category: "prizes",   amount: 96.25, reimbursed: false },
  { description: "Prizes — brothers' side",        category: "prizes",   amount: 88.10, reimbursed: false },
  { description: "Guest speaker travel",           category: "travel",   amount: 31.80, reimbursed: true  },
  { description: "Guest speaker parking",          category: "travel",   amount: 6.50,  reimbursed: true  },
  { description: "Water — 3 crates",               category: "catering", amount: 7.35,  reimbursed: true  },
  { description: "Plates and napkins",             category: "supplies", amount: 5.90,  reimbursed: true  },
  { description: "Confectionery for EOT2",         category: "catering", amount: 18.60, reimbursed: false },
  { description: "End of year food",               category: "catering", amount: 76.65, reimbursed: false },
  { description: "Certificates and printing",      category: "supplies", amount: 9.20,  reimbursed: true  },
  { description: "Decorations for the EOT3 hall",  category: "decor",    amount: 38.00, reimbursed: false },
  { description: "Bookmarks for every student",    category: "gifts",    amount: 44.75, reimbursed: false },
];

const OPENING_BALANCE = 142.5; // invented carry-over from the year before

async function main() {
  const { data: season, error: seasonError } = await db
    .from("seasons").select("id, deposit_amount").eq("label", "2025/26").single();
  if (seasonError || !season) throw new Error("season 2025/26 missing — apply 0014 first");
  const seasonId = season.id;
  const price = Number(season.deposit_amount);

  await db.from("seasons")
    .update({ opening_balance: OPENING_BALANCE, is_current: true }).eq("id", seasonId);

  // Entries cascade to payments, so this clears both.
  await db.from("deposit_entries").delete().eq("season_id", seasonId);
  await db.from("expenses").delete().eq("season_id", seasonId);

  const { data: students } = await db
    .from("profiles").select("id, full_name, section")
    .eq("role", "student").order("full_name");
  const { data: teachers } = await db
    .from("profiles").select("id, full_name").eq("role", "teacher").order("full_name");
  if (!students?.length) throw new Error("no demo students found — run seed_demo.ts first");

  // Every enrolled student, linked to their profile. A handful get a re-entry
  // so the buy-back path has something to show.
  const reEntryAt = new Set([2, 7, 11]);
  const rows = students.map((s: { id: string; full_name: string; section: string }, i: number) => ({
    season_id: seasonId,
    student_id: s.id,
    full_name: s.full_name,
    section: s.section,
    still_in: true,
    // Explicitly zero rather than left to the column default. This array is
    // inserted alongside the unlinked rows, which do carry these keys, and
    // PostgREST fills the gaps in a mixed-shape batch with explicit nulls —
    // which the not-null constraint rejects before any default applies.
    term1_strikes: 0,
    term2_strikes: 0,
    term3_strikes: 0,
    notes: reEntryAt.has(i) ? "Re-entered after three strikes" : null,
  }));

  const unlinked = UNLINKED.map((p) => ({
    season_id: seasonId,
    student_id: null,
    full_name: p.name,
    section: p.section,
    still_in: false,
    term1_strikes: p.strikes[0],
    term2_strikes: p.strikes[1],
    term3_strikes: p.strikes[2],
    notes: p.note,
  }));

  const { data: inserted, error: entryError } = await db
    .from("deposit_entries").insert([...rows, ...unlinked]).select("id, student_id, full_name");
  if (entryError) throw entryError;

  // One deposit each, plus a re-entry for the few marked above.
  const payments = inserted.flatMap((e: { id: string; full_name: string }) => {
    const idx = students.findIndex((s: { full_name: string }) => s.full_name === e.full_name);
    const list = [{ entry_id: e.id, amount: price, kind: "deposit", paid_on: "2025-10-06" }];
    if (idx > -1 && reEntryAt.has(idx)) {
      list.push({ entry_id: e.id, amount: price, kind: "re_entry", paid_on: "2026-04-13" });
    }
    return list;
  });
  const { error: payError } = await db.from("deposit_payments").insert(payments);
  if (payError) throw payError;

  const { error: costError } = await db.from("expenses").insert(
    COSTS.map((c, i) => ({
      season_id: seasonId,
      description: c.description,
      category: c.category,
      amount: c.amount,
      reimbursed: c.reimbursed,
      paid_by: teachers?.[i % teachers.length]?.id ?? null,
      incurred_on: "2026-05-01",
    })),
  );
  if (costError) throw costError;

  const { data: finance } = await db
    .from("v_season_finance").select("*").eq("season_id", seasonId).single();

  console.log(`seeded season 2025/26`);
  console.log(`  entries   ${inserted.length} (${rows.length} linked, ${unlinked.length} unlinked)`);
  console.log(`  payments  ${payments.length}`);
  console.log(`  costs     ${COSTS.length}`);
  console.log(`  opening   £${Number(finance.opening_balance).toFixed(2)}`);
  console.log(`  deposits  £${Number(finance.deposits).toFixed(2)}`);
  console.log(`  gross     £${Number(finance.gross_income).toFixed(2)}`);
  console.log(`  costs     £${Number(finance.costs).toFixed(2)}`);
  console.log(`  left over £${Number(finance.left_over).toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
