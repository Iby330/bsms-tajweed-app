import { permanentRedirect } from "next/navigation";

/**
 * The homework index is gone. Homework now lives in two places that each have
 * one job: outstanding work on /home, marks on /progress. Individual homework
 * still lives at /homework/[n] — only this index moved.
 */
export default function HomeworkIndex() {
  permanentRedirect("/progress");
}
