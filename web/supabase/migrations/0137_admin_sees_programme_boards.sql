-- The programme lead teaches the Esteemed Ustadhs, so his section is `ustadhs`,
-- and 0131 walled every ustadhs viewer into their own cohort's boards. An admin
-- oversees the whole programme: they now get the brothers' and sisters' boards
-- like any other viewer outside a walled-off cohort. Non-admin ustadhs and demo
-- viewers are unchanged, and a seat (never an admin) keeps its cohort. Same
-- definitions as 0131 otherwise, read through acting_id() as 0132 requires.
create or replace view v_lb_individual_all as
 SELECT p.full_name, c.name AS class_name, p.section,
    round(avg(hp.pct), 2) AS pct,
    rank() OVER (ORDER BY (avg(hp.pct)) DESC) AS rank
   FROM v_hw_pct_all hp
     JOIN profiles p ON p.id = hp.student_id AND p.is_active AND NOT p.hidden_from_students
     JOIN classes c ON c.id = p.class_id
  WHERE CASE
          WHEN ((SELECT profiles.section FROM profiles WHERE profiles.id = public.acting_id() AND NOT profiles.is_admin) IN ('demo'::section_t, 'ustadhs'::section_t))
            THEN p.section = (SELECT profiles.section FROM profiles WHERE profiles.id = public.acting_id())
          ELSE p.section IN ('brothers'::section_t, 'sisters'::section_t)
        END
  GROUP BY p.id, p.full_name, c.name, p.section;

create or replace view v_lb_hifz_class_all as
 SELECT c.name AS class_name, c.section,
    round(avg(h.pct), 2) AS pct,
    rank() OVER (ORDER BY (avg(h.pct)) DESC) AS rank
   FROM v_hifz_progress_all h
     JOIN profiles p ON p.id = h.student_id AND p.is_active AND NOT p.hidden_from_students
     JOIN classes c ON c.id = p.class_id
  WHERE CASE
          WHEN ((SELECT profiles.section FROM profiles WHERE profiles.id = public.acting_id() AND NOT profiles.is_admin) IN ('demo'::section_t, 'ustadhs'::section_t))
            THEN c.section = (SELECT profiles.section FROM profiles WHERE profiles.id = public.acting_id())
          ELSE c.section IN ('brothers'::section_t, 'sisters'::section_t)
        END
  GROUP BY c.id, c.name, c.section;
