import { ProgressChart } from "@/components/murajaah/progress-chart";
import { SessionHistory } from "@/components/murajaah/session-history";
import { overrideFor, sessionsAsReciter } from "@/lib/murajaah/queries";
import type { ClassTarget } from "@/lib/murajaah/targets";

/**
 * "My revision", under the listener screen: the student's own saved
 * attempts as a reciter. The progress chart (All juz / All hizb / each
 * portion) judges by the current target and their own limits; the history,
 * newest first, keeps each attempt's verdict from the day. Server component:
 * the shared chart and history are client components fed plain data.
 */
export async function MyRevision({
  studentId, classId, target,
}: {
  studentId: string;
  classId: string | null;
  target: ClassTarget;
}) {
  const [sessions, override] = await Promise.all([
    sessionsAsReciter(studentId),
    classId ? overrideFor(classId, studentId) : Promise.resolve(null),
  ]);

  return (
    <section aria-labelledby="my-revision" className="space-y-3">
      <div className="divider">
        <span className="label" id="my-revision">My revision</span>
        <span className="r" />
        <span className="m" />
      </div>
      <ProgressChart sessions={sessions} target={target} override={override} title="Progress by attempt" />
      <SessionHistory
        sessions={sessions}
        show="listener"
        title="My attempts"
        emptyText="Nothing saved yet. When a classmate listens to you and saves, it appears here."
      />
    </section>
  );
}
