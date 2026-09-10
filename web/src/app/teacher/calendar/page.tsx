import { currentProfile } from "@/lib/supabase/server";
import { teacherClass } from "@/lib/teacher/scope";
import { isoDate } from "@/lib/attendance/session";
import { YearCalendar } from "@/components/app/year-calendar";
import { teachingDaysLabel, timetableFor } from "@/lib/attendance/calendar";
import { getTermPlans } from "@/lib/curriculum/plan";

export const dynamic = "force-dynamic";

/**
 * The teaching year for the teacher's own class.
 *
 * The same screen the students see, drawn for the same section — so a teacher
 * checking "when is our next hifdh" and a student checking it are reading the
 * same grid rather than two that might drift apart.
 *
 * A teacher with no class of their own falls back to their own section. That
 * is the programme lead, who has no single timetable to show; the calendar
 * they get is the one their section is on, and the class-day note says whose.
 */
export default async function TeacherCalendar() {
  const [profile, mine] = await Promise.all([currentProfile(), teacherClass()]);
  const section = mine?.section ?? profile?.section ?? "brothers";
  const timetable = timetableFor(section, mine?.name);
  // Teacher links go to /teacher/lessons, which locks nothing.
  const plans = await getTermPlans(mine?.name, timetable, { audience: "teacher" });

  return (
    <>
      <header className="masthead">
        <h1><span>Calendar</span></h1>
        <p>
          {mine ? `${mine.name} · class days for the year.` : "Class days for the year."}
        </p>
        <div className="meta">
          <span className="label">{teachingDaysLabel(timetable)}</span>
          <span className="label hi">
            {section === "sisters" ? "Sisters" : "Brothers"}
          </span>
        </div>
      </header>

      <YearCalendar
        timetable={timetable}
        section={section}
        today={isoDate(new Date())}
        plans={plans}
      />
    </>
  );
}
