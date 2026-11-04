import { redirect } from "next/navigation";

/** Resources was folded into Courses (2026-11-04): its series sit under
 *  Reflections there. The address stays so old links still land. */
export default function Resources() {
  redirect("/courses");
}
