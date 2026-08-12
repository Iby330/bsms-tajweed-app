import { redirect } from "next/navigation";

/** The review queue grew into the Homework section; old links follow it. */
export default function ReviewMoved() {
  redirect("/teacher/homework");
}
