import { permanentRedirect } from "next/navigation";

/** The flat lesson list became the course drill-down at /courses. Individual
 *  lessons still live at /lessons/[lessonId], so only this index moves. */
export default function Lessons() {
  permanentRedirect("/courses");
}
