-- ═══════════════════════════════════════════════════════════════════════
-- The 2026/27 application fee is £15, not £20.
--
-- The price itself lives in the app, in FEE_PENCE (lib/applications/form.ts),
-- and every screen reads it from there. This migration exists only to correct
-- the COMMENT that 0025 left on `applications.fee_pence`, which still tells
-- the next person to read the schema that this year's intake was charged £20.
--
-- NO ROWS ARE TOUCHED, and that is the point of the column rather than an
-- oversight. `fee_pence` is written per application precisely so a price
-- change cannot rewrite what somebody was asked for. It happens that nobody
-- had applied while the price was £20 — the table is empty — but the rule is
-- the same either way: change the constant, leave the history.
--
-- 0025 itself is left alone. It is applied, and an applied migration is a
-- record of what happened rather than a document to keep current.
-- ═══════════════════════════════════════════════════════════════════════

comment on column applications.fee_pence is
  'What this application was asked to pay, in pence. £10 in 2025/26, and £15 '
  'in 2026/27 (briefly set to £20 before the intake opened). Kept per row so '
  'a future price change cannot rewrite history.';
