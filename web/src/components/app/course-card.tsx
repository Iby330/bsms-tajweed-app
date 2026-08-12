import Link from "next/link";
import { ProgressBar } from "@/components/app/progress-bar";
import { MixedText } from "@/components/app/mixed-text";
import type { Course } from "@/lib/curriculum/tree";

/** One course inside a term. `nextModule` is the whole point of this card —
 *  it answers "where was I?" without opening the course. */
export function CourseCard({ course }: { course: Course }) {
  const next = course.nextModule;
  const finished = course.actionableCount > 0 && course.doneCount >= course.actionableCount;

  return (
    <Link
      href={`/courses/${course.termId}/${course.series}`}
      className="glass glass-hover group flex flex-col rounded-2xl p-5"
    >
      <h2 className="font-heading text-lg tracking-tight transition-colors group-hover:text-ink-2">
        {course.label}
      </h2>
      {course.blurb && (
        <p className="mt-1 text-xs text-muted-foreground">{course.blurb}</p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {course.moduleCount} {course.moduleCount === 1 ? "module" : "modules"} released
        {course.hasHomework ? " · video + homework" : " · video only"}
      </p>

      <div className="mt-auto pt-4">
        <ProgressBar
          done={course.doneCount}
          total={course.actionableCount}
          emptyNote="Waiting on videos"
          label={`${course.label}: ${course.doneCount} of ${course.actionableCount} modules complete`}
        />

        <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
          {course.actionableCount === 0 ? (
            "Nothing to do here yet"
          ) : finished ? (
            <span className="text-ok">All caught up ✓</span>
          ) : next ? (
            <>
              <span className="text-foreground">Next:</span> Week {next.weekNumber}
              {next.title && (
                <>
                  {" · "}
                  <MixedText text={next.title} />
                </>
              )}
            </>
          ) : course.unlockedCount === 0 ? (
            "Opens later in the year"
          ) : (
            "Nothing outstanding"
          )}
        </p>
      </div>
    </Link>
  );
}
