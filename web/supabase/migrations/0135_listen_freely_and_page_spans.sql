-- Two things the ustadhs' full mushaf and free listening need.
--
-- 1. quran_words grows from 106 pages to all 604 (about 15k rows to about 78k).
--    A page read gets an index, and the page-count lookup stops walking the
--    table 1000 rows at a time: at that size it would be 78 round trips on a
--    student's page each time the cache went cold.
--
-- 2. The ustadhs have no fixed partners. Whoever is listening picks who recites,
--    so a session in that class needs only that both sit in it. Every other
--    class still needs an active pair.

create index if not exists idx_quran_words_page on quran_words (page_number);

create or replace view v_surah_page_spans as
  select surah_number, count(distinct page_number)::int as pages
    from quran_words
   group by surah_number;
comment on view v_surah_page_spans is 'How many mushaf pages each seeded surah spans.';
grant select on v_surah_page_spans to service_role;

create or replace function public.can_listen_freely(p_reviewer uuid, p_reciter uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from profiles a
      join profiles b on b.class_id = a.class_id
     where a.id = p_reviewer and b.id = p_reciter
       and a.section = 'ustadhs' and b.section = 'ustadhs'
       and a.role = 'student' and b.role = 'student'
       and b.is_active
  );
$$;
revoke all on function public.can_listen_freely(uuid, uuid) from public;
grant execute on function public.can_listen_freely(uuid, uuid) to authenticated;

alter policy s_sessions_insert on revision_sessions with check (
  reviewer_id = public.acting_id()
  and kind = 'peer'
  and (
    exists (
      select 1 from revision_pairs p
       where p.active
         and ((p.student_a = revision_sessions.reviewer_id and p.student_b = revision_sessions.reciter_id)
           or (p.student_b = revision_sessions.reviewer_id and p.student_a = revision_sessions.reciter_id))
    )
    or public.can_listen_freely(reviewer_id, reciter_id)
  )
);
