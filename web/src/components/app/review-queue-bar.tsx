import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { moduleTitle } from "@/lib/curriculum/tree";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QueueItem } from "@/lib/marking/queue";

const hrefOf = (id: string) => `/teacher/homework/submission/${id}`;

function label(item: QueueItem) {
  return item.homeworkNumber !== null && item.homeworkSeries
    ? homeworkLabel(item.homeworkNumber, item.homeworkSeries)
    : "Homework";
}

/**
 * What is still waiting, on the marking page itself: a Next button for the
 * oldest script after this one, and the rest of the queue in a dropdown. A
 * native <details>, so it needs no client code and opens without JavaScript.
 *
 * `released` is this script having just been approved; the bar then leads
 * with that, so the teacher can see it went through before moving on.
 */
export function ReviewQueueBar({
  queue, released, doneHref,
}: { queue: QueueItem[]; released: boolean; doneHref: string }) {
  const next = queue[0];

  return (
    <div className="box c12 mb-6 !items-stretch gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          {released && <span className="font-medium text-ok">Released. </span>}
          {queue.length ? (
            <span className="text-muted-foreground">
              {queue.length} more waiting for review
            </span>
          ) : (
            <span className="text-muted-foreground">Nothing else waiting for review.</span>
          )}
        </span>
        {next ? (
          <Link
            href={hrefOf(next.id)}
            className={cn(buttonVariants({ size: "sm", variant: released ? "default" : "outline" }))}
          >
            Next: {next.studentName}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          released && (
            <Link href={doneHref} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Back to homework
            </Link>
          )
        )}
      </div>

      {queue.length > 0 && (
        <details className="group border-t border-line pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            Show all waiting
          </summary>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {queue.map((item) => {
              const title = moduleTitle(item.homeworkTitle);
              return (
                <li key={item.id}>
                  <Link
                    href={hrefOf(item.id)}
                    className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-baseline gap-2 max-md:flex-col max-md:gap-0">
                      <span className="truncate">{item.studentName}</span>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {label(item)}
                        {title && <>{" · "}<MixedText text={title} /></>}
                      </span>
                    </span>
                    {item.isLate && (
                      <span className="shrink-0 rounded bg-warn/12 px-1.5 py-0.5 text-xs text-warn">late</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
