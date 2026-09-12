-- ═══════════════════════════════════════════════════════════════════════
-- Whole-ayah mistakes: word_position becomes nullable, null = the ayah.
--
-- Forgetting a whole ayah is commoner than fumbling one word, and the
-- reviewer logs it by tapping the ayah's end marker. It has to be ONE row:
-- expanding it into a row per word would count a single lapse eight times
-- and swamp aggregatePatterns / the session totals, which is precisely
-- what the feature exists to measure.
--
-- Makhraj is excluded by construction — its `detail` is a letter of a
-- specific word, so it cannot describe a whole ayah.
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

alter table revision_mistakes alter column word_position drop not null;

comment on column revision_mistakes.word_position is
  'Word within the ayah (1-based), or NULL for a mistake spanning the whole ayah.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'revision_mistakes_ayah_scope_not_makhraj'
  ) then
    alter table revision_mistakes
      add constraint revision_mistakes_ayah_scope_not_makhraj
      check (word_position is not null or category <> 'makhraj');
  end if;
end $$;
