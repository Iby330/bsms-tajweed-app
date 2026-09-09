import { currentProfile } from "@/lib/supabase/server";
import { isoDate } from "@/lib/attendance/session";
import { YearCalendar } from "@/components/app/year-calendar";
import { teachingDaysLabel, timetableFor } from "@/lib/attendance/calendar";

export const dynamic = "force-dynamic";

/**
 * When a student has class.
 *
 * Everything on here comes from their class's timetable, because no two of
 * them need match: the brothers do tajweed on Monday and hifdh on Thursday,
 * the sisters the other way about, and the sisters' hifdh day is settled per
 * class once the year starts.
 */
export default async function Calendar() {
  const profile = (await currentProfile())!;
  // The class first, its section only as the fallback: the sisters settle
  // their hifdh day class by class, so two sisters' classes can differ.
  const timetable = timetableFor(profile.section, profile.classes?.name);

  return (
    <>
      <header className="masthead">
        <h1><span>Calendar</span></h1>
        <p>Your class days for the year, term by term.</p>
        <div className="meta">
          <span className="label">{teachingDaysLabel(timetable)}</span>
        </div>
      </header>

      <YearCalendar timetable={timetable} section={profile.section} today={isoDate(new Date())} />
    </>
  );
}
