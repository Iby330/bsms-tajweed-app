-- Undo 0074 now that Resources carries it: Masjid An-Nabawi watches the Umm
-- al-Kitab videos from Resources (0075), so the course leaves their Term 1
-- plan, its week-1 placements and its homework hold go with it.

delete from class_homework_holds h using classes c, courses co
 where h.class_id = c.id and h.course_id = co.id and c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab';
delete from class_course_items i using classes c, courses co
 where i.class_id = c.id and i.course_id = co.id and c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab';
delete from class_courses cc using classes c, courses co
 where cc.class_id = c.id and cc.course_id = co.id and c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab';
